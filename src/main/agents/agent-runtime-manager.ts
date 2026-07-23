import {
  AgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type AgentSessionEvent,
  type ExtensionUIContext,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AgentCommandReceipt,
  AgentInteractionRequest,
  AgentInteractionResponse,
  AgentSessionSnapshot,
  AgentThinkingLevel,
  AgentTodoItem,
  AppAgentEvent,
  AppAgentMessage,
  AppAgentRuntime,
  CreateAgentSessionInput,
  CreateTransientAgentSessionInput,
  PromoteTransientAgentSessionInput,
  SendAgentMessageInput
} from '../../shared/agent-runtime'
import { reduceAgentEvent } from '../../shared/agent-runtime'
import type { AgentSessionsRepository } from '../persistence/repos/agent-sessions-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { PermissionRulesRepository } from '../persistence/repos/permission-rules-repo'
import type { McpAuthRepository } from '../persistence/repos/mcp-auth-repo'
import type { McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import { writePiModelConfig } from './pi/pi-model-config'
import {
  createMcpClientTools,
  type McpClientTools,
  type McpClientToolsOptions
} from './pi/mcp-client-tools'
import type { McpServerHealthRegistry } from './pi/mcp-server-health'
import { createPiPermissionExtension } from './pi/pi-permission-extension'
import { PiSdkEventMapper } from './pi/pi-sdk-event-mapper'
import {
  createTiaStateManagementTools,
  type TiaStateManagementToolsOptions
} from './pi/tia-state-management-tools'

type PendingInteraction = {
  resolve: (response: AgentInteractionResponse) => void
  cleanup?: () => void
}

type LiveSession = {
  persistence: 'durable' | 'transient'
  session: AgentSession
  modelRuntime: ModelRuntime
  piProvider: string
  agentDir: string
  temporaryDirectory?: string
  mapper: PiSdkEventMapper
  snapshot: AgentSessionSnapshot
  messages: AppAgentMessage[]
  unsubscribe: () => void
  pendingInteractions: Map<string, PendingInteraction>
  mcpTools: McpClientTools
}

export type AgentRuntimeManagerOptions = {
  sessionsRepo: AgentSessionsRepository
  providersRepo: ProvidersRepository
  permissionRulesRepo: PermissionRulesRepository
  agentDataRoot: string
  sessionDataRoot: string
  credentialRoot: string
  globalSkillsRoot: string
  mcpServersRepo?: McpServersRepository
  mcpAuthRepository?: McpAuthRepository
  mcpServerHealth?: McpServerHealthRegistry
  resolveMcpCommand?: McpClientToolsOptions['resolveCommand']
  stateManagement?: Omit<TiaStateManagementToolsOptions, 'workspaceRootPath' | 'confirm'>
}

function deterministicTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'New thread'
  return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}…` : normalized
}

const SESSION_STARTUP_TIMEOUT_MS = 20_000

function transientTranscript(messages: AppAgentMessage[]): string {
  const lines = messages.flatMap((message) => {
    const content = message.parts
      .flatMap((part) => {
        if (part.type === 'text' || part.type === 'thinking' || part.type === 'notice') {
          return part.text.trim() ? [part.text.trim()] : []
        }
        if (part.type === 'tool') return [`[Used ${part.toolName}: ${part.status}]`]
        if (part.type === 'image') return [`[Attached image: ${part.name}]`]
        return []
      })
      .join('\n')
      .trim()
    return content ? [`${message.role === 'assistant' ? 'Assistant' : 'User'}: ${content}`] : []
  })
  return lines.join('\n\n').slice(0, 60_000)
}

function withStartupTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Pi startup timed out. Check the selected provider and try again.')),
      SESSION_STARTUP_TIMEOUT_MS
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export class AgentRuntimeManager implements AppAgentRuntime {
  private readonly live = new Map<string, LiveSession>()
  private readonly listeners = new Map<string, Set<(event: AppAgentEvent) => void>>()

  constructor(private readonly options: AgentRuntimeManagerOptions) {}

  async createSession(input: CreateAgentSessionInput): Promise<AgentSessionSnapshot> {
    const record = await this.options.sessionsRepo.create(input)
    try {
      return await withStartupTimeout(this.startSession(record))
    } catch (error) {
      await this.options.sessionsRepo.delete(record.id)
      throw error
    }
  }

  async createTransientSession(
    input: CreateTransientAgentSessionInput
  ): Promise<AgentSessionSnapshot> {
    const now = new Date().toISOString()
    const record: AgentSessionSnapshot = {
      id: randomUUID(),
      transient: true,
      transientPurpose: input.purpose,
      workspaceId: null,
      workspacePath: input.workspacePath,
      title: input.title?.trim() || 'New thread',
      providerId: input.providerId,
      provider: input.provider,
      modelId: input.modelId,
      thinkingLevel: input.thinkingLevel ?? 'medium',
      accessMode: input.accessMode ?? 'standard',
      pinned: false,
      status: 'starting',
      isCompacting: false,
      queue: { steering: [], followUps: [] },
      todos: [],
      createdAt: now,
      updatedAt: now
    }
    return withStartupTimeout(this.startSession(record, { transient: true }))
  }

  async closeTransientSession(sessionId: string): Promise<void> {
    const runtime = this.live.get(sessionId)
    if (!runtime || runtime.persistence !== 'transient') {
      throw new Error('Temporary thread not found')
    }
    await this.disposeRuntime(runtime)
  }

  async promoteTransientSession(
    input: PromoteTransientAgentSessionInput
  ): Promise<AgentSessionSnapshot> {
    const transient = this.live.get(input.sessionId)
    if (!transient || transient.persistence !== 'transient') {
      throw new Error('Temporary thread not found')
    }
    if (transient.snapshot.status !== 'idle' || transient.snapshot.pendingInteraction) {
      throw new Error('Wait for the assistant to finish before continuing in Chat')
    }

    const record = await this.options.sessionsRepo.create({
      workspaceId: input.workspaceId,
      workspacePath: input.workspacePath,
      title: transient.snapshot.title,
      providerId: transient.snapshot.providerId,
      provider: transient.snapshot.provider,
      modelId: transient.snapshot.modelId,
      thinkingLevel: transient.snapshot.thinkingLevel,
      accessMode: transient.snapshot.accessMode
    })

    let promoted: AgentSessionSnapshot | undefined
    try {
      const created = await withStartupTimeout(this.startSession(record))
      promoted = created
      const durable = await this.requireLive(created.id)
      const movedMessages = transient.messages.map((message) => ({
        ...message,
        sessionId: created.id
      }))
      await Promise.all(
        movedMessages.map((message) => this.options.sessionsRepo.appendMessage(message))
      )
      durable.messages = movedMessages
      const transcript = transientTranscript(transient.messages)
      if (transcript) {
        durable.session.sessionManager.appendCustomMessageEntry(
          'tia-studio-transient-handoff',
          `This conversation began as a temporary TIA Studio flow. Continue with this context:\n\n${transcript}`,
          false,
          { source: transient.snapshot.transientPurpose ?? 'temporary-thread' }
        )
      }
      await this.closeTransientSession(input.sessionId)
      return durable.snapshot
    } catch (error) {
      if (promoted) await this.closeSession(promoted.id).catch(() => undefined)
      await this.options.sessionsRepo.delete(record.id)
      throw error
    }
  }

  async resumeSession(sessionId: string): Promise<AgentSessionSnapshot> {
    const existing = this.live.get(sessionId)
    if (existing) return existing.snapshot
    return this.startSession(await this.requireSession(sessionId))
  }

  async closeSession(sessionId: string): Promise<void> {
    const runtime = this.live.get(sessionId)
    if (!runtime) return
    if (runtime.persistence === 'transient') {
      await this.closeTransientSession(sessionId)
      return
    }
    await this.disposeRuntime(runtime)
    await this.options.sessionsRepo.update(sessionId, {
      status: 'stopped',
      pendingInteraction: null
    })
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([...this.live.keys()].map((sessionId) => this.closeSession(sessionId)))
  }

  private async disposeRuntime(runtime: LiveSession): Promise<void> {
    await this.abortWithin(runtime.session.abort())
    runtime.unsubscribe()
    runtime.session.dispose()
    await runtime.mcpTools.close()
    this.cancelPendingInteractions(runtime)
    this.live.delete(runtime.snapshot.id)
    this.listeners.delete(runtime.snapshot.id)
    if (runtime.temporaryDirectory) {
      await rm(runtime.temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async updateRuntimeSnapshot(
    runtime: LiveSession,
    input: Partial<
      Pick<
        AgentSessionSnapshot,
        | 'upstreamSessionId'
        | 'upstreamSessionFile'
        | 'title'
        | 'providerId'
        | 'provider'
        | 'modelId'
        | 'thinkingLevel'
        | 'accessMode'
        | 'pinned'
        | 'status'
        | 'isCompacting'
        | 'queue'
        | 'todos'
      >
    > & { pendingInteraction?: AgentInteractionRequest | null }
  ): Promise<AgentSessionSnapshot> {
    if (runtime.persistence === 'transient') {
      const snapshotInput: Omit<typeof input, 'pendingInteraction'> = Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== 'pendingInteraction')
      )
      const next: AgentSessionSnapshot = {
        ...runtime.snapshot,
        ...snapshotInput,
        updatedAt: new Date().toISOString()
      }
      if ('pendingInteraction' in input) {
        if (input.pendingInteraction) next.pendingInteraction = input.pendingInteraction
        else delete next.pendingInteraction
      }
      runtime.snapshot = next
      return next
    }

    const updated = await this.options.sessionsRepo.update(runtime.snapshot.id, input)
    if (!updated) throw new Error('Session not found')
    runtime.snapshot = updated
    return updated
  }

  async sendMessage(input: SendAgentMessageInput): Promise<AgentCommandReceipt> {
    const runtime = await this.requireLive(input.sessionId)
    const trimmed = input.text.trim()
    const attachments = input.attachments ?? []
    if (!trimmed && attachments.length === 0) {
      return { commandId: randomUUID(), accepted: false, error: 'Message is empty' }
    }

    if (runtime.snapshot.title === 'New thread' && trimmed) {
      const title = deterministicTitle(trimmed)
      runtime.session.setSessionName(title)
      const updated = await this.updateRuntimeSnapshot(runtime, { title })
      await this.publish(
        runtime,
        runtime.mapper.applicationEvent({ type: 'session.updated', snapshot: updated })
      )
    }

    const message: AppAgentMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: 'user',
      parts: [
        ...(trimmed ? [{ type: 'text' as const, text: trimmed }] : []),
        ...attachments.map((attachment) => ({
          type: 'image' as const,
          attachmentId: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          data: attachment.data
        }))
      ],
      createdAt: new Date().toISOString(),
      status: 'complete'
    }
    if (runtime.persistence === 'durable') await this.options.sessionsRepo.appendMessage(message)
    await this.publish(
      runtime,
      runtime.mapper.applicationEvent({ type: 'message.started', message })
    )
    await this.publish(
      runtime,
      runtime.mapper.applicationEvent({
        type: 'message.completed',
        messageId: message.id,
        status: 'complete'
      })
    )
    const images = attachments.map((attachment) => ({
      type: 'image' as const,
      data: attachment.data,
      mimeType: attachment.mimeType
    }))
    const commandId = randomUUID()
    try {
      if (input.behavior === 'steer') await runtime.session.steer(trimmed, images)
      else if (input.behavior === 'follow-up') await runtime.session.followUp(trimmed, images)
      else {
        void runtime.session.prompt(trimmed, { images }).catch((error) => {
          void this.publish(
            runtime,
            runtime.mapper.applicationEvent({
              type: 'run.failed',
              error: error instanceof Error ? error.message : 'Pi rejected the message'
            })
          )
        })
      }
      return { commandId, accepted: true, behavior: input.behavior }
    } catch (error) {
      return {
        commandId,
        accepted: false,
        behavior: input.behavior,
        error: error instanceof Error ? error.message : 'Pi rejected the message'
      }
    }
  }

  async cancelRun(sessionId: string): Promise<void> {
    const runtime = await this.requireLive(sessionId)
    await this.resolvePendingInteractions(runtime)
    await this.abortWithin(runtime.session.abort())
    const updated = await this.updateRuntimeSnapshot(runtime, {
      status: 'idle',
      pendingInteraction: null
    })
    await this.publish(
      runtime,
      runtime.mapper.applicationEvent({ type: 'session.updated', snapshot: updated })
    )
  }

  private async abortWithin(abort: Promise<unknown>): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        abort.catch(() => undefined),
        new Promise<void>((resolve) => {
          timeoutId = setTimeout(resolve, 1_500)
        })
      ])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  private cancelPendingInteractions(runtime: LiveSession): void {
    for (const [id, pending] of runtime.pendingInteractions) {
      pending.cleanup?.()
      pending.resolve({ id, cancelled: true })
    }
    runtime.pendingInteractions.clear()
  }

  private async resolvePendingInteractions(runtime: LiveSession): Promise<void> {
    const pendingIds = [...runtime.pendingInteractions.keys()]
    this.cancelPendingInteractions(runtime)
    for (const interactionId of pendingIds) {
      await this.publish(
        runtime,
        runtime.mapper.applicationEvent({ type: 'interaction.resolved', interactionId })
      )
    }
  }

  async setModel(
    sessionId: string,
    providerId: string,
    providerType: string,
    modelId: string
  ): Promise<void> {
    const runtime = await this.requireLive(sessionId)
    const provider = await this.options.providersRepo.getById(providerId)
    if (!provider || !provider.enabled) throw new Error('The selected provider is unavailable')
    const { piProvider } = await writePiModelConfig(runtime.agentDir, {
      ...provider,
      selectedModel: modelId
    })
    await runtime.modelRuntime.reloadConfig()
    const apiKey = provider.apiKey.trim() || (provider.type === 'ollama' ? 'ollama' : '')
    if (apiKey) await runtime.modelRuntime.setRuntimeApiKey(piProvider, apiKey)
    const model = runtime.modelRuntime.getModel(piProvider, modelId)
    if (!model) throw new Error(`Pi model is unavailable: ${piProvider}/${modelId}`)
    await runtime.session.setModel(model)
    await this.updateRuntimeSnapshot(runtime, {
      providerId,
      provider: providerType,
      modelId
    })
    runtime.piProvider = piProvider
  }

  async setThinkingLevel(sessionId: string, level: AgentThinkingLevel): Promise<void> {
    const runtime = await this.requireLive(sessionId)
    runtime.session.setThinkingLevel(level)
    await this.updateRuntimeSnapshot(runtime, { thinkingLevel: level })
  }

  async setAccessMode(sessionId: string, mode: 'standard' | 'full'): Promise<void> {
    const current = await this.requireSession(sessionId)
    if (current.status === 'running')
      throw new Error('Access mode cannot change during an active run')
    const currentRuntime = this.live.get(sessionId)
    if (currentRuntime?.persistence === 'transient') {
      throw new Error('Access mode cannot change in a temporary thread')
    }
    const wasLive = this.live.has(sessionId)
    if (wasLive) await this.closeSession(sessionId)
    const updated = await this.options.sessionsRepo.update(sessionId, { accessMode: mode })
    if (!updated) throw new Error('Session not found')
    if (wasLive) await this.startSession(updated)
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const normalized = deterministicTitle(title)
    const runtime = this.live.get(sessionId)
    runtime?.session.setSessionName(normalized)
    if (runtime) {
      await this.updateRuntimeSnapshot(runtime, { title: normalized })
      return
    }
    const updated = await this.options.sessionsRepo.update(sessionId, { title: normalized })
    if (!updated) throw new Error('Session not found')
  }

  async getSession(sessionId: string): Promise<AgentSessionSnapshot> {
    return this.live.get(sessionId)?.snapshot ?? this.requireSession(sessionId)
  }

  async getMessages(sessionId: string): Promise<AppAgentMessage[]> {
    return this.live.get(sessionId)?.messages ?? this.options.sessionsRepo.listMessages(sessionId)
  }

  async respondToInteraction(sessionId: string, response: AgentInteractionResponse): Promise<void> {
    const runtime = await this.requireLive(sessionId)
    const pending = runtime.pendingInteractions.get(response.id)
    if (!pending) throw new Error('Pi interaction is no longer pending')
    runtime.pendingInteractions.delete(response.id)
    pending.cleanup?.()
    pending.resolve(response)
    await this.publish(
      runtime,
      runtime.mapper.applicationEvent({
        type: 'interaction.resolved',
        interactionId: response.id
      })
    )
  }

  subscribe(sessionId: string, listener: (event: AppAgentEvent) => void): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(sessionId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(sessionId)
    }
  }

  private async startSession(
    record: AgentSessionSnapshot,
    options: { transient?: boolean } = {}
  ): Promise<AgentSessionSnapshot> {
    const transient = options.transient ?? record.transient === true
    const temporaryDirectory = transient
      ? await mkdtemp(join(tmpdir(), 'tia-studio-transient-thread-'))
      : undefined
    const provider = await this.options.providersRepo.getById(record.providerId)
    if (!provider || !provider.enabled) throw new Error('The selected provider is unavailable')
    if (transient) {
      await mkdir(record.workspacePath, { recursive: true })
    } else {
      await Promise.all([
        mkdir(this.options.agentDataRoot, { recursive: true }),
        mkdir(this.options.sessionDataRoot, { recursive: true }),
        mkdir(this.options.globalSkillsRoot, { recursive: true }),
        mkdir(record.workspacePath, { recursive: true })
      ])
    }
    const agentDir = temporaryDirectory ?? join(this.options.agentDataRoot, record.id)
    const { piProvider } = await writePiModelConfig(agentDir, provider)
    const settingsManager = SettingsManager.inMemory({
      defaultProvider: piProvider,
      defaultModel: record.modelId,
      defaultThinkingLevel: record.thinkingLevel,
      defaultProjectTrust: 'always',
      enableInstallTelemetry: false,
      enableAnalytics: false
    })
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, 'unused-auth.json'),
      modelsPath: join(agentDir, 'models.json'),
      allowModelNetwork: false
    })
    const apiKey = provider.apiKey.trim() || (provider.type === 'ollama' ? 'ollama' : '')
    if (apiKey) await modelRuntime.setRuntimeApiKey(piProvider, apiKey)
    const model = modelRuntime.getModel(piProvider, record.modelId)
    if (!model) throw new Error(`Pi model is unavailable: ${piProvider}/${record.modelId}`)
    const sessionManager = transient
      ? SessionManager.inMemory(record.workspacePath, { id: record.id })
      : record.upstreamSessionFile
        ? SessionManager.open(
            record.upstreamSessionFile,
            this.options.sessionDataRoot,
            record.workspacePath
          )
        : SessionManager.create(record.workspacePath, this.options.sessionDataRoot, {
            id: record.id
          })
    const runtimeRef: { current?: LiveSession } = {}
    const mcpTools = transient
      ? await createMcpClientTools({ mcpServers: {} })
      : await this.loadMcpClientTools()
    const resourceLoader = new DefaultResourceLoader({
      cwd: record.workspacePath,
      agentDir,
      settingsManager,
      extensionFactories: [
        createPiPermissionExtension({
          workspacePath: record.workspacePath,
          credentialRoot: this.options.credentialRoot,
          fullAccess: record.accessMode === 'full',
          listWorkspaceRules: () => this.options.permissionRulesRepo.list(record.workspacePath),
          touchWorkspaceRules: (ids) => this.options.permissionRulesRepo.touch(ids),
          saveWorkspaceRules: async (proposals) => {
            await this.options.permissionRulesRepo.createWorkspaceAllows({
              workspacePath: record.workspacePath,
              proposals,
              rationale: 'Approved from a TIA Studio thread'
            })
          },
          requestPermission: async (analysis) => {
            const runtime = runtimeRef.current
            if (!runtime) return 'deny'
            const response = await this.requestInteraction(runtime, {
              id: randomUUID(),
              method: 'permission',
              title: 'Allow this command?',
              message: `Run command: ${analysis.command}`,
              command: analysis.command,
              workspacePath: record.workspacePath,
              reusable: analysis.reusable,
              proposedPrefixes: analysis.proposals.map((proposal) => proposal.display),
              ...(analysis.reason ? { nonReusableReason: analysis.reason } : {})
            })
            return 'permissionOutcome' in response ? response.permissionOutcome : 'deny'
          }
        })
      ],
      noExtensions: true,
      noSkills: true,
      additionalSkillPaths: [this.options.globalSkillsRoot, join(record.workspacePath, 'skills')],
      noPromptTemplates: true,
      noThemes: true
    })
    await resourceLoader.reload()
    const nameTheThread: ToolDefinition = {
      name: 'name_thread',
      label: 'Name the thread',
      description:
        'Give this conversation a short, specific title that describes the user’s task. Use this after the first user request and again only when the task meaningfully changes.',
      promptSnippet: 'Name the current conversation with a concise task title.',
      promptGuidelines: [
        'Call name_thread after receiving the first substantive user request. Do not ask the user to name the thread.',
        'Use a short task-oriented title. Call it again only when the task changes materially.'
      ],
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'A concise title for the current conversation.'
          }
        },
        required: ['title'],
        additionalProperties: false
      } as ToolDefinition['parameters'],
      execute: async (_toolCallId, params) => {
        const runtime = runtimeRef.current
        if (!runtime) throw new Error('The session is not ready to be named')
        const title = deterministicTitle(String((params as { title: unknown }).title))
        runtime.session.setSessionName(title)
        const updated = await this.updateRuntimeSnapshot(runtime, { title })
        await this.publish(
          runtime,
          runtime.mapper.applicationEvent({ type: 'session.updated', snapshot: updated })
        )
        return {
          content: [{ type: 'text', text: `Thread named “${title}”.` }],
          details: { title }
        }
      }
    }
    const updateTodoList: ToolDefinition = {
      name: 'update_todo_list',
      label: 'Update todo list',
      description:
        'Publish the current execution plan as a concise todo list, keep it current, and mark completed items.',
      promptSnippet: 'Use update_todo_list for multi-step work so the user can follow progress.',
      promptGuidelines: [
        'Use update_todo_list when the request has multiple meaningful steps.',
        'Keep exactly one item in progress at a time and update the list as work completes.'
      ],
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            maxItems: 12,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 80 },
                title: { type: 'string', minLength: 1, maxLength: 160 },
                detail: { type: 'string', maxLength: 240 },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
              },
              required: ['id', 'title', 'status'],
              additionalProperties: false
            }
          }
        },
        required: ['items'],
        additionalProperties: false
      } as ToolDefinition['parameters'],
      execute: async (_toolCallId, params) => {
        const runtime = runtimeRef.current
        if (!runtime) throw new Error('The session is not ready to update todos')
        const rawItems = (params as { items?: unknown }).items
        const todos: AgentTodoItem[] = Array.isArray(rawItems)
          ? rawItems
              .slice(0, 12)
              .map((raw, index) => {
                const item = raw as Record<string, unknown>
                const status: AgentTodoItem['status'] =
                  item.status === 'completed' || item.status === 'in_progress'
                    ? item.status
                    : 'pending'
                return {
                  id: String(item.id || `todo-${index + 1}`),
                  title: String(item.title || '')
                    .trim()
                    .slice(0, 160),
                  ...(typeof item.detail === 'string' && item.detail.trim()
                    ? { detail: item.detail.trim().slice(0, 240) }
                    : {}),
                  status
                }
              })
              .filter((item) => item.title.length > 0)
          : []
        const updated = await this.updateRuntimeSnapshot(runtime, { todos })
        await this.publish(
          runtime,
          runtime.mapper.applicationEvent({ type: 'session.updated', snapshot: updated })
        )
        return {
          content: [
            {
              type: 'text',
              text: `Updated ${todos.length} todo item${todos.length === 1 ? '' : 's'}.`
            }
          ],
          details: { todos }
        }
      }
    }
    const allStateManagementTools = this.options.stateManagement
      ? createTiaStateManagementTools({
          ...this.options.stateManagement,
          workspaceRootPath: record.workspacePath,
          confirm: async ({ title, message }) => {
            const runtime = runtimeRef.current
            if (!runtime) throw new Error('The session is not ready to confirm this change')
            const response = await this.requestInteraction(runtime, {
              id: randomUUID(),
              method: 'confirm',
              title,
              message
            })
            return 'confirmed' in response && response.confirmed
          }
        })
      : []
    const stateManagementTools =
      transient && record.transientPurpose === 'mcp-setup'
        ? allStateManagementTools.filter((tool) => tool.name === 'manage_tia_mcp_servers')
        : allStateManagementTools
    const { session } = await createAgentSession({
      cwd: record.workspacePath,
      agentDir,
      modelRuntime,
      model,
      thinkingLevel: record.thinkingLevel,
      sessionManager,
      settingsManager,
      resourceLoader,
      customTools: [nameTheThread, updateTodoList, ...stateManagementTools, ...mcpTools.tools]
    })
    const lastSequence = transient ? 0 : await this.options.sessionsRepo.getLastSequence(record.id)
    const mapper = new PiSdkEventMapper(record.id, () => new Date(), lastSequence)
    const runtime: LiveSession = {
      persistence: transient ? 'transient' : 'durable',
      session,
      modelRuntime,
      piProvider,
      agentDir,
      ...(temporaryDirectory ? { temporaryDirectory } : {}),
      mapper,
      snapshot: record,
      messages: transient ? [] : await this.options.sessionsRepo.listMessages(record.id),
      unsubscribe: () => {},
      pendingInteractions: new Map(),
      mcpTools
    }
    runtimeRef.current = runtime
    try {
      this.live.set(record.id, runtime)
      runtime.unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        void this.handlePiEvent(runtime, event)
      })
      await session.bindExtensions({
        uiContext: this.createExtensionUi(runtime)
      })
      const updated = await this.updateRuntimeSnapshot(runtime, {
        upstreamSessionId: session.sessionId,
        upstreamSessionFile: session.sessionFile,
        status: session.isStreaming ? 'running' : 'idle'
      })
      if (updated.title !== 'New thread') session.setSessionName(updated.title)
      for (const notice of mcpTools.notices) {
        await this.publish(
          runtime,
          runtime.mapper.applicationEvent({
            type: 'runtime.notice',
            level: 'warning',
            text: notice
          })
        )
      }
      return updated
    } catch (error) {
      runtime.unsubscribe()
      this.live.delete(record.id)
      await session.abort().catch(() => {})
      session.dispose()
      await mcpTools.close()
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
      throw error
    }
  }

  private async loadMcpClientTools(): Promise<McpClientTools> {
    if (!this.options.mcpServersRepo) {
      return createMcpClientTools({ mcpServers: {} })
    }

    try {
      return await createMcpClientTools(await this.options.mcpServersRepo.getSettings(), {
        resolveCommand: this.options.resolveMcpCommand,
        mcpAuthRepository: this.options.mcpAuthRepository,
        onStatus: (update) => {
          if (update.state === 'connected') {
            this.options.mcpServerHealth?.connected(update.serverId, update.toolCount)
          } else if (update.state === 'unsupported') {
            this.options.mcpServerHealth?.unsupported(update.serverId)
          } else {
            this.options.mcpServerHealth?.failed(update.serverId)
          }
        }
      })
    } catch (error) {
      return {
        tools: [],
        notices: [
          `MCP tools were unavailable: ${error instanceof Error ? error.message : 'settings could not be loaded'}`
        ],
        close: async () => {}
      }
    }
  }

  private createExtensionUi(runtime: LiveSession): ExtensionUIContext {
    const request = (value: AgentInteractionRequest, signal?: AbortSignal) =>
      this.requestInteraction(runtime, value, signal)
    return {
      select: async (title, options, dialog) => {
        const response = await request(
          { id: randomUUID(), method: 'select', title, options, timeout: dialog?.timeout },
          dialog?.signal
        )
        return 'value' in response ? response.value : undefined
      },
      confirm: async (title, message, dialog) => {
        const response = await request(
          { id: randomUUID(), method: 'confirm', title, message, timeout: dialog?.timeout },
          dialog?.signal
        )
        return 'confirmed' in response ? response.confirmed : false
      },
      input: async (title, placeholder, dialog) => {
        const response = await request(
          { id: randomUUID(), method: 'input', title, placeholder, timeout: dialog?.timeout },
          dialog?.signal
        )
        return 'value' in response ? response.value : undefined
      },
      editor: async (title, prefill) => {
        const response = await request({ id: randomUUID(), method: 'editor', title, prefill })
        return 'value' in response ? response.value : undefined
      },
      notify: (message, type = 'info') => {
        void this.publish(
          runtime,
          runtime.mapper.applicationEvent({ type: 'runtime.notice', level: type, text: message })
        )
      },
      onTerminalInput: () => () => {},
      setStatus: () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: async () => {
        throw new Error('Custom terminal UI is unavailable in TIA Studio')
      },
      pasteToEditor: () => {},
      setEditorText: () => {},
      getEditorText: () => '',
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      theme: undefined as never,
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: 'Themes are owned by TIA Studio' }),
      getToolsExpanded: () => true,
      setToolsExpanded: () => {}
    }
  }

  private async requestInteraction(
    runtime: LiveSession,
    request: AgentInteractionRequest,
    signal?: AbortSignal
  ): Promise<AgentInteractionResponse> {
    if (signal?.aborted) return { id: request.id, cancelled: true }
    const timeout = 'timeout' in request ? request.timeout : undefined
    const response = new Promise<AgentInteractionResponse>((resolve) => {
      const pending: PendingInteraction = { resolve }
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const cancel = () => {
        if (!runtime.pendingInteractions.delete(request.id)) return
        pending.cleanup?.()
        resolve({ id: request.id, cancelled: true })
      }
      if (signal) {
        signal.addEventListener('abort', cancel, { once: true })
      }
      if (timeout) timeoutId = setTimeout(cancel, timeout)
      pending.cleanup = () => {
        signal?.removeEventListener('abort', cancel)
        if (timeoutId) clearTimeout(timeoutId)
      }
      runtime.pendingInteractions.set(request.id, pending)
    })
    await this.publish(
      runtime,
      runtime.mapper.applicationEvent({ type: 'interaction.requested', request })
    )
    return response
  }

  private async handlePiEvent(runtime: LiveSession, input: AgentSessionEvent): Promise<void> {
    for (const event of runtime.mapper.map(input)) await this.publish(runtime, event)
  }

  private async publish(runtime: LiveSession, event: AppAgentEvent): Promise<void> {
    if (
      runtime.persistence === 'durable' &&
      !(await this.options.sessionsRepo.appendEvent(event))
    ) {
      return
    }
    const view = reduceAgentEvent(
      {
        snapshot: runtime.snapshot,
        messages: runtime.messages,
        seenEventIds: [],
        lastSequence: event.sequence - 1
      },
      event
    )
    runtime.snapshot = view.snapshot
    runtime.messages = view.messages
    if (runtime.persistence === 'transient') {
      runtime.snapshot = { ...view.snapshot, updatedAt: event.timestamp }
    } else {
      await this.options.sessionsRepo.update(event.sessionId, {
        status: view.snapshot.status,
        isCompacting: view.snapshot.isCompacting,
        queue: view.snapshot.queue,
        pendingInteraction: view.snapshot.pendingInteraction ?? null
      })
      await Promise.all(
        view.messages.map((message) => this.options.sessionsRepo.appendMessage(message))
      )
    }
    for (const listener of this.listeners.get(event.sessionId) ?? []) listener(event)
  }

  private async requireLive(sessionId: string): Promise<LiveSession> {
    const existing = this.live.get(sessionId)
    if (existing) return existing
    await this.resumeSession(sessionId)
    const started = this.live.get(sessionId)
    if (!started) throw new Error('Pi session failed to start')
    return started
  }

  private async requireSession(sessionId: string): Promise<AgentSessionSnapshot> {
    const live = this.live.get(sessionId)
    if (live) return live.snapshot
    const session = await this.options.sessionsRepo.getById(sessionId)
    if (!session) throw new Error('Pi session not found')
    return session
  }
}

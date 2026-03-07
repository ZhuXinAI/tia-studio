import os from 'node:os'
import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import type { ToolsInput } from '@mastra/core/agent'
import type { MemoryConfig } from '@mastra/core/memory'
import type { Mastra } from '@mastra/core/mastra'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { handleChatStream } from '@mastra/ai-sdk'
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'
import { Memory } from '@mastra/memory'
import { MCPClient, type MastraMCPServerDefinition } from '@mastra/mcp'
import type { UIMessage, UIMessageChunk } from 'ai'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { AppMcpServer, McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { resolveModel } from './model-resolver'
import { createBrowserSearchTool } from './tools/browser-search-tool'
import { AttachmentUploader } from './processors/attachment-uploader'

type StreamChatParams = {
  assistantId: string
  messages: UIMessage[]
  threadId: string
  profileId: string
  trigger?: 'submit-message' | 'regenerate-message'
  abortSignal?: AbortSignal
}

type ListThreadMessagesParams = {
  assistantId: string
  threadId: string
  profileId: string
}

type AssistantContext = {
  assistant: NonNullable<Awaited<ReturnType<AssistantsRepository['getById']>>>
  provider: NonNullable<Awaited<ReturnType<ProvidersRepository['getById']>>>
}

export type AssistantRuntime = {
  streamChat: (params: StreamChatParams) => Promise<ReadableStream<UIMessageChunk>>
  listThreadMessages: (params: ListThreadMessagesParams) => Promise<UIMessage[]>
}

type AssistantRuntimeServiceOptions = {
  mastra: Mastra
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  threadsRepo: ThreadsRepository
  webSearchSettingsRepo: WebSearchSettingsRepository
  mcpServersRepo: McpServersRepository
}

type JsonObject = Record<string, unknown>

export class AssistantRuntimeService implements AssistantRuntime {
  private readonly registeredAgentSignatures = new Map<string, string>()
  private readonly assistantMcpClients = new Map<string, MCPClient>()

  constructor(private readonly options: AssistantRuntimeServiceOptions) {}

  async streamChat(params: StreamChatParams): Promise<ReadableStream<UIMessageChunk>> {
    const { assistant, provider } = await this.getAssistantContext(params.assistantId)
    await this.assertThreadBelongsToAssistant({
      assistantId: params.assistantId,
      threadId: params.threadId,
      profileId: params.profileId
    })
    await this.ensureAgentRegistered(assistant, provider)

    const stream = await handleChatStream({
      mastra: this.options.mastra,
      agentId: assistant.id,
      params: {
        messages: params.messages,
        trigger: params.trigger,
        abortSignal: params.abortSignal,
        maxSteps: assistant.maxSteps,
        providerOptions: this.buildProviderOptions(provider.type),
        memory: {
          thread: params.threadId,
          resource: params.profileId,
          options: {
            generateTitle: true
          }
        }
      },
      sendReasoning: true
    })

    return this.streamWithThreadTitleSync(stream as ReadableStream<UIMessageChunk>, {
      threadId: params.threadId,
      profileId: params.profileId
    })
  }

  private streamWithThreadTitleSync(
    stream: ReadableStream<UIMessageChunk>,
    params: {
      threadId: string
      profileId: string
    }
  ): ReadableStream<UIMessageChunk> {
    const reader = stream.getReader()
    let isSynced = false

    return new ReadableStream<UIMessageChunk>({
      pull: async (controller) => {
        try {
          const { done, value } = await reader.read()
          if (done) {
            if (!isSynced) {
              isSynced = true
              await this.syncThreadAfterStreaming(params)
            }
            controller.close()
            reader.releaseLock()
            return
          }

          // Capture usage from finish chunk and add to message metadata
          if (value.type === 'finish' && 'totalUsage' in value) {
            const usage = value.totalUsage as {
              inputTokens: number
              outputTokens: number
              totalTokens: number
            }

            // Add usage to message metadata
            controller.enqueue({
              ...value,
              messageMetadata: {
                ...(value.messageMetadata || {}),
                usage
              }
            } as UIMessageChunk)
          } else {
            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
          reader.releaseLock()
        }
      },
      cancel: async (reason) => {
        try {
          await reader.cancel(reason)
        } finally {
          reader.releaseLock()
        }

        if (!isSynced) {
          isSynced = true
          await this.syncThreadAfterStreaming(params)
        }
      }
    })
  }

  private async syncThreadAfterStreaming(params: {
    threadId: string
    profileId: string
  }): Promise<void> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await this.options.threadsRepo.touchLastMessageAt(params.threadId, now).catch(() => undefined)
    await this.syncGeneratedThreadTitle(params).catch(() => undefined)
  }

  private async syncGeneratedThreadTitle(params: {
    threadId: string
    profileId: string
  }): Promise<void> {
    const appThread = await this.options.threadsRepo.getById(params.threadId)
    if (!appThread || appThread.resourceId !== params.profileId) {
      return
    }

    if (!this.shouldReplaceThreadTitle(appThread.title)) {
      return
    }

    const storage = this.options.mastra.getStorage()
    if (!storage) {
      return
    }

    const memoryStore = await storage.getStore('memory')
    if (!memoryStore || typeof memoryStore.getThreadById !== 'function') {
      return
    }

    const memoryThread = await memoryStore.getThreadById({
      threadId: params.threadId
    })
    const generatedTitle = this.toNonEmptyString(memoryThread?.title)
    if (!generatedTitle || appThread.title.trim() === generatedTitle) {
      return
    }

    await this.options.threadsRepo.updateTitle(params.threadId, generatedTitle)
  }

  private shouldReplaceThreadTitle(title: string): boolean {
    const normalizedTitle = title.trim()
    if (normalizedTitle.length === 0) {
      return true
    }

    return /^New Thread(?: \d+)?$/i.test(normalizedTitle)
  }

  async listThreadMessages(params: ListThreadMessagesParams): Promise<UIMessage[]> {
    await this.assertAssistantExists(params.assistantId)
    await this.assertThreadBelongsToAssistant(params)

    const storage = this.options.mastra.getStorage()
    if (!storage) {
      return []
    }

    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      return []
    }

    const { messages } = await memoryStore.listMessages({
      threadId: params.threadId,
      resourceId: params.profileId,
      perPage: false
    })

    return toAISdkV5Messages(messages)
      .filter((message) => message.role === 'assistant' || message.role === 'user')
      .map((message) => message as UIMessage)
  }

  private async assertAssistantExists(assistantId: string): Promise<void> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }
  }

  private async assertThreadBelongsToAssistant(params: ListThreadMessagesParams): Promise<void> {
    const thread = await this.options.threadsRepo.getById(params.threadId)
    if (
      !thread ||
      thread.assistantId !== params.assistantId ||
      thread.resourceId !== params.profileId
    ) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }
  }

  private async getAssistantContext(assistantId: string): Promise<AssistantContext> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }

    if (!assistant.providerId) {
      throw new ChatRouteError(409, 'provider_not_found', 'Assistant provider is not configured')
    }

    const provider = await this.options.providersRepo.getById(assistant.providerId)
    if (!provider) {
      throw new ChatRouteError(409, 'provider_not_found', 'Assistant provider is not configured')
    }

    if (!provider.enabled) {
      throw new ChatRouteError(409, 'provider_disabled', 'Assistant provider is disabled')
    }

    if (!provider.selectedModel) {
      throw new ChatRouteError(409, 'provider_model_missing', 'Assistant provider model is missing')
    }

    return { assistant, provider }
  }

  private async ensureAgentRegistered(
    assistant: AssistantContext['assistant'],
    provider: AssistantContext['provider']
  ): Promise<void> {
    const enabledMcpServers = await this.resolveEnabledMcpServers(assistant.mcpConfig ?? {})
    const mcpServersSignature = JSON.stringify(enabledMcpServers)
    const nextSignature = [
      assistant.id,
      assistant.updatedAt,
      assistant.instructions,
      provider.id,
      provider.updatedAt,
      provider.type,
      provider.selectedModel,
      provider.apiHost ?? '',
      JSON.stringify(assistant.workspaceConfig ?? {}),
      JSON.stringify(assistant.skillsConfig ?? {}),
      JSON.stringify(assistant.mcpConfig ?? {}),
      assistant.maxSteps,
      JSON.stringify(assistant.memoryConfig ?? {}),
      mcpServersSignature
    ].join('|')

    if (this.registeredAgentSignatures.get(assistant.id) === nextSignature) {
      return
    }

    this.options.mastra.removeAgent(assistant.id)

    const browserSearchTool = createBrowserSearchTool({
      resolveDefaultEngine: async () => this.options.webSearchSettingsRepo.getDefaultEngine(),
      resolveKeepBrowserWindowOpen: async () =>
        this.options.webSearchSettingsRepo.getKeepBrowserWindowOpen(),
      resolveShowBrowser: async () => this.options.webSearchSettingsRepo.getShowBrowser()
    })

    const model = resolveModel({
      type: provider.type,
      apiKey: provider.apiKey,
      apiHost: provider.apiHost,
      selectedModel: provider.selectedModel
    })

    const mcpTools = await this.buildMcpTools(assistant.id, enabledMcpServers)
    const tools: ToolsInput = {
      browserSearch: browserSearchTool,
      ...mcpTools
    }
    const now = new Date()
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    })
    const baseInstructions = assistant.instructions || 'You are a helpful assistant.'
    const agentInstructions = `${baseInstructions}\n\nCurrent date and time: ${currentDateTime}\n\nWhen users ask for current web information, call the browserSearch tool before answering.`

    const storage = this.options.mastra.getStorage()
    const memory = new Memory({
      ...(storage ? { storage } : {}),
      options: {
        ...this.resolveMemoryOptions(assistant.memoryConfig),
        generateTitle: true
      }
    })
    const workspace = await this.buildWorkspace(
      assistant.workspaceConfig ?? {},
      assistant.skillsConfig ?? {}
    )

    const agent = new Agent({
      id: assistant.id,
      name: assistant.name,
      instructions: agentInstructions,
      model: model as never,
      memory,
      ...(workspace ? { workspace } : {}),
      tools,
      inputProcessors: [new AttachmentUploader()]
    })

    this.options.mastra.addAgent(agent, assistant.id)
    this.registeredAgentSignatures.set(assistant.id, nextSignature)
  }

  private async buildWorkspace(
    workspaceConfig: JsonObject,
    skillsConfig: JsonObject
  ): Promise<Workspace | undefined> {
    const rootPath = this.resolveWorkspaceRootPath(workspaceConfig)
    if (!rootPath) {
      return undefined
    }

    const skillsPaths = this.resolveSkillsPaths(rootPath, skillsConfig)
    const filesystem = new LocalFilesystem({ basePath: rootPath })
    const sandbox = new LocalSandbox({
      workingDirectory: rootPath
    })
    const workspace = new Workspace({
      filesystem,
      sandbox,
      ...(skillsPaths.length > 0 ? { skills: skillsPaths } : {})
    })

    await workspace.init()
    return workspace
  }

  private resolveWorkspaceRootPath(workspaceConfig: JsonObject): string | null {
    const rootPath = this.toNonEmptyString(workspaceConfig.rootPath)
    return rootPath ? path.resolve(rootPath) : null
  }

  private resolveSkillsPaths(workspaceRootPath: string, skillsConfig: JsonObject): string[] {
    const rawPaths = [
      path.join(os.homedir(), '.claude', 'skills'),
      path.join(os.homedir(), '.agent', 'skills'),
      path.join(workspaceRootPath, 'skills'),
      ...this.toStringList(skillsConfig.path),
      ...this.toStringList(skillsConfig.paths),
      ...this.toStringList(skillsConfig.skillPath),
      ...this.toStringList(skillsConfig.skillPaths),
      ...this.toStringList(skillsConfig.skills),
      ...this.toStringList(skillsConfig.directories)
    ]

    const uniquePaths = new Set<string>()
    for (const rawPath of rawPaths) {
      uniquePaths.add(rawPath)
    }

    return [...uniquePaths]
  }

  private async resolveEnabledMcpServers(
    mcpConfig: JsonObject
  ): Promise<Record<string, AppMcpServer>> {
    let settings: Awaited<ReturnType<McpServersRepository['getSettings']>>
    try {
      settings = await this.options.mcpServersRepo.getSettings()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read MCP settings'
      throw new ChatRouteError(409, 'mcp_settings_invalid', message)
    }

    const assistantEnabledServers = this.toBooleanMap(mcpConfig)

    const entries = Object.entries(settings.mcpServers)
      .filter(
        ([serverName, server]) => server.isActive && assistantEnabledServers[serverName] === true
      )
      .sort(([left], [right]) => left.localeCompare(right))

    return Object.fromEntries(entries)
  }

  private async buildMcpTools(
    assistantId: string,
    enabledMcpServers: Record<string, AppMcpServer>
  ): Promise<ToolsInput> {
    if (Object.keys(enabledMcpServers).length === 0) {
      await this.disconnectMcpClient(assistantId)
      return {}
    }

    const serverDefinitions = this.toMcpServerDefinitions(enabledMcpServers)
    if (Object.keys(serverDefinitions).length === 0) {
      await this.disconnectMcpClient(assistantId)
      return {}
    }

    await this.disconnectMcpClient(assistantId)

    const mcpClient = new MCPClient({
      id: `assistant-${assistantId}`,
      servers: serverDefinitions
    })

    try {
      const tools = await mcpClient.listTools()
      this.assistantMcpClients.set(assistantId, mcpClient)
      return tools as ToolsInput
    } catch (error) {
      await mcpClient.disconnect().catch(() => undefined)
      const message =
        error instanceof Error ? error.message : 'Unable to connect to one or more MCP servers'
      throw new ChatRouteError(409, 'mcp_connection_failed', message)
    }
  }

  private toMcpServerDefinitions(
    servers: Record<string, AppMcpServer>
  ): Record<string, MastraMCPServerDefinition> {
    const entries = Object.entries(servers)
      .map(([serverName, server]) => {
        const definition = this.toMcpServerDefinition(server)
        if (!definition) {
          return null
        }

        return [serverName, definition] as const
      })
      .filter((entry): entry is readonly [string, MastraMCPServerDefinition] => entry !== null)

    return Object.fromEntries(entries)
  }

  private toMcpServerDefinition(server: AppMcpServer): MastraMCPServerDefinition | null {
    const command = this.toNonEmptyString(server.command)
    const url = this.toNonEmptyString(server.url)
    const serverType = server.type.trim().toLowerCase()

    if (serverType === 'stdio') {
      if (!command) {
        return null
      }

      return {
        command,
        ...(server.args.length > 0 ? { args: server.args } : {}),
        ...(Object.keys(server.env).length > 0 ? { env: server.env } : {})
      }
    }

    if (url) {
      try {
        return {
          url: new URL(url)
        }
      } catch {
        // ignore invalid URLs in MCP server definitions
      }
    }

    if (command) {
      return {
        command,
        ...(server.args.length > 0 ? { args: server.args } : {}),
        ...(Object.keys(server.env).length > 0 ? { env: server.env } : {})
      }
    }

    return null
  }

  private async disconnectMcpClient(assistantId: string): Promise<void> {
    const existingClient = this.assistantMcpClients.get(assistantId)
    if (!existingClient) {
      return
    }

    this.assistantMcpClients.delete(assistantId)
    await existingClient.disconnect().catch(() => undefined)
  }

  private resolveMemoryOptions(memoryConfig: JsonObject | null): MemoryConfig {
    const memoryConfigObject = memoryConfig ?? {}
    const explicitOptions = this.toJsonObject(memoryConfigObject.options)
    const baseOptions =
      Object.keys(explicitOptions).length > 0 ? explicitOptions : memoryConfigObject

    return {
      ...(baseOptions as MemoryConfig),
      generateTitle: true
    }
  }

  private buildProviderOptions(providerType: string): Record<string, unknown> | undefined {
    if (providerType !== 'openai-response') {
      return undefined
    }

    return {
      openai: {
        store: false
      }
    }
  }

  private toStringList(value: unknown): string[] {
    if (typeof value === 'string') {
      return this.toNonEmptyString(value) ? [value.trim()] : []
    }

    if (!Array.isArray(value)) {
      return []
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  private toBooleanMap(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }

    const entries = Object.entries(value)
      .map(([key, itemValue]) => {
        const normalizedKey = key.trim()
        if (normalizedKey.length === 0) {
          return null
        }

        if (typeof itemValue === 'boolean') {
          return [normalizedKey, itemValue] as const
        }

        if (typeof itemValue === 'string') {
          const normalizedValue = itemValue.trim().toLowerCase()
          if (normalizedValue === 'true' || normalizedValue === '1') {
            return [normalizedKey, true] as const
          }

          if (normalizedValue === 'false' || normalizedValue === '0') {
            return [normalizedKey, false] as const
          }
        }

        if (typeof itemValue === 'number') {
          return [normalizedKey, itemValue !== 0] as const
        }

        return null
      })
      .filter((entry): entry is readonly [string, boolean] => entry !== null)

    return Object.fromEntries(entries)
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private toJsonObject(value: unknown): JsonObject {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject
    }

    return {}
  }
}

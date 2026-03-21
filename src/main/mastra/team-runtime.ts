import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import type { AgentExecutionOptions } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { createTool } from '@mastra/core/tools'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { toAISdkStream as toAISdkV5Stream } from '@mastra/ai-sdk'
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'
import { Memory } from '@mastra/memory'
import type { UIMessage, UIMessageChunk } from 'ai'
import { z } from 'zod'
import type { BuiltInBrowserController } from '../built-in-browser-manager'
import { buildBuiltInBrowserGuidance } from '../built-in-browser-contract'
import type { AppAssistant, AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { AppProvider, ProvidersRepository } from '../persistence/repos/providers-repo'
import type { TeamThreadsRepository } from '../persistence/repos/team-threads-repo'
import type { TeamWorkspacesRepository } from '../persistence/repos/team-workspaces-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { TeamRunStatusStore } from '../server/chat/team-run-status-store'
import { createDefaultModelSettings } from './model-retry-settings'
import { resolveModel } from './model-resolver'
import { buildOpenAIProviderOptions } from './openai-provider-options'
import { createBuiltInBrowserTools } from './tools/built-in-browser-tools'
import { createContainedLocalFilesystemInstructions } from './workspace-filesystem-instructions'

type StreamTeamChatParams = {
  threadId: string
  profileId: string
  messages: UIMessage[]
  trigger?: 'submit-message' | 'regenerate-message'
  abortSignal?: AbortSignal
}

type ListTeamThreadMessagesParams = {
  threadId: string
  profileId: string
}

export type TeamRuntime = {
  streamTeamChat: (
    params: StreamTeamChatParams
  ) => Promise<{ runId: string; stream: ReadableStream<UIMessageChunk> }>
  listTeamThreadMessages: (params: ListTeamThreadMessagesParams) => Promise<UIMessage[]>
}

type TeamRuntimeServiceOptions = {
  mastra: Mastra
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  teamWorkspacesRepo: TeamWorkspacesRepository
  teamThreadsRepo: TeamThreadsRepository
  statusStore: TeamRunStatusStore
  builtInBrowserManager?: BuiltInBrowserController
}

type JsonObject = Record<string, unknown>

type TeamMemberRuntime = {
  assistant: AppAssistant
  provider: AppProvider
  agent: Agent
  toolName: string
}

type TeamMemberIdentity = {
  assistantId: string
  name: string
}

const DEFAULT_TEAM_SUPERVISOR_MAX_STEPS = 100

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractMentionedAssistantIds(content: string, members: TeamMemberIdentity[]): string[] {
  const resolvedMentions: string[] = []

  for (const member of members) {
    const mentionPatterns = [member.name, member.assistantId]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => new RegExp(`(^|\\s)@${escapeRegExp(value)}(?=\\s|$|[.,!?])`, 'i'))

    if (
      mentionPatterns.some((pattern) => pattern.test(content)) &&
      !resolvedMentions.includes(member.assistantId)
    ) {
      resolvedMentions.push(member.assistantId)
    }
  }

  return resolvedMentions
}

type TeamMemberToolResult = {
  kind: 'team-member-result'
  assistantId: string
  assistantName: string
  task: string
  text: string
  mentions: string[]
  mentionNames: string[]
  subAgentThreadId: string | null
  subAgentResourceId: string | null
}

type TeamCompletionToolResult = {
  kind: 'team-complete'
  status: 'complete'
  summary: string | null
}

export class TeamRuntimeService implements TeamRuntime {
  constructor(private readonly options: TeamRuntimeServiceOptions) {}

  async streamTeamChat(
    params: StreamTeamChatParams
  ): Promise<{ runId: string; stream: ReadableStream<UIMessageChunk> }> {
    const thread = await this.assertValidThread(params.threadId, params.profileId)
    const workspace = await this.options.teamWorkspacesRepo.getById(thread.workspaceId)
    if (!workspace || workspace.rootPath.trim().length === 0) {
      throw new ChatRouteError(409, 'team_not_ready', 'Team workspace is not configured')
    }

    const members = await this.options.teamWorkspacesRepo.listMembers(workspace.id)
    if (members.length === 0) {
      throw new ChatRouteError(409, 'team_not_ready', 'Team must include at least one member')
    }

    const supervisorProviderId = this.toNonEmptyString(workspace.supervisorProviderId)
    const supervisorModel = this.toNonEmptyString(workspace.supervisorModel)
    if (!supervisorProviderId || !supervisorModel) {
      throw new ChatRouteError(
        409,
        'team_not_ready',
        'Team supervisor provider and model must be configured'
      )
    }

    const supervisorProvider = await this.options.providersRepo.getById(supervisorProviderId)
    if (!supervisorProvider) {
      throw new ChatRouteError(409, 'team_not_ready', 'Team supervisor provider is not available')
    }

    const liveAssistants = (
      await Promise.all(
        members.map((member) => this.options.assistantsRepo.getById(member.assistantId))
      )
    ).filter((assistant): assistant is AppAssistant => assistant !== null)

    const storage = this.options.mastra.getStorage()
    const sharedMemory = new Memory({
      ...(storage ? { storage } : {}),
      options: {
        generateTitle: true
      }
    })

    const runnableMembers = await this.buildRunnableMembers({
      assistants: liveAssistants,
      teamWorkspaceRootPath: workspace.rootPath,
      sharedMemory,
      teamDescription: workspace.teamDescription
    })
    if (runnableMembers.length === 0) {
      throw new ChatRouteError(
        409,
        'team_not_ready',
        'Team must include at least one runnable live assistant'
      )
    }

    const runId = randomUUID()
    const supervisorWorkspace = await this.buildWorkspace(workspace.rootPath, {})
    const supervisorTools = this.buildSupervisorTools({
      members: runnableMembers,
      runId,
      threadId: thread.id,
      profileId: params.profileId
    })
    const runtimeSupervisor = new Agent({
      id: `team-supervisor:${thread.id}`,
      name: 'Team Supervisor',
      instructions: this.buildSupervisorInstructions(workspace.teamDescription, runnableMembers),
      model: resolveModel(
        {
          type: supervisorProvider.type,
          apiKey: supervisorProvider.apiKey,
          apiHost: supervisorProvider.apiHost,
          selectedModel: supervisorModel
        },
        {},
        {
          acpWorkingDirectory: workspace.rootPath
        }
      ) as never,
      tools: supervisorTools,
      memory: sharedMemory as never,
      workspace: supervisorWorkspace
    })
    this.options.statusStore.startRun({ runId, threadId: thread.id })

    try {
      const stream = await runtimeSupervisor.stream(params.messages as never, {
        maxSteps: DEFAULT_TEAM_SUPERVISOR_MAX_STEPS,
        modelSettings: createDefaultModelSettings(),
        providerOptions: this.buildProviderOptions(supervisorProvider),
        memory: {
          thread: thread.id,
          resource: params.profileId,
          options: {
            generateTitle: true
          }
        },
        runId,
        abortSignal: params.abortSignal,
        toolChoice: 'required',
        onIterationComplete: async (context) => {
          this.options.statusStore.append(runId, {
            type: 'iteration-complete',
            data: {
              iteration: Number(context['iteration'] ?? 0),
              text: typeof context['text'] === 'string' ? context['text'] : undefined
            }
          })

          if (this.didSupervisorCompleteTurn(context)) {
            return {
              continue: false
            }
          }

          return undefined
        }
      } satisfies AgentExecutionOptions)

      return {
        runId,
        stream: this.streamWithRunSync(
          toAISdkV5Stream(stream, {
            from: 'agent',
            sendReasoning: true
          }) as unknown as ReadableStream<UIMessageChunk>,
          {
            threadId: thread.id,
            runId,
            profileId: params.profileId
          }
        )
      }
    } catch (error) {
      this.options.statusStore.failRun(
        runId,
        error instanceof Error ? error.message : 'Failed to execute team chat run'
      )
      throw error
    }
  }

  async listTeamThreadMessages(params: ListTeamThreadMessagesParams): Promise<UIMessage[]> {
    await this.assertValidThread(params.threadId, params.profileId)

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

  private async assertValidThread(threadId: string, profileId: string) {
    const thread = await this.options.teamThreadsRepo.getById(threadId)
    if (!thread || thread.resourceId !== profileId) {
      throw new ChatRouteError(404, 'team_thread_not_found', 'Team thread not found')
    }

    return thread
  }

  private async buildRunnableMembers(input: {
    assistants: AppAssistant[]
    teamWorkspaceRootPath: string
    sharedMemory: Memory
    teamDescription: string
  }): Promise<TeamMemberRuntime[]> {
    const entries = await Promise.all(
      input.assistants.map(async (assistant, index) => {
        const providerId = this.toNonEmptyString(assistant.providerId)
        if (!providerId) {
          return null
        }

        const provider = await this.options.providersRepo.getById(providerId)
        if (!provider || !this.toNonEmptyString(provider.selectedModel)) {
          return null
        }

        const workspace = await this.buildWorkspace(
          input.teamWorkspaceRootPath,
          assistant.skillsConfig ?? {}
        )
        const builtInBrowserTools = this.options.builtInBrowserManager
          ? createBuiltInBrowserTools({
              controller: this.options.builtInBrowserManager
            })
          : {}

        const agent = new Agent({
          id: assistant.id,
          name: assistant.name,
          description: this.toNonEmptyString(assistant.description) ?? undefined,
          instructions: this.buildMemberInstructions({
            assistant,
            teamDescription: input.teamDescription,
            teamMembers: input.assistants
          }),
          model: resolveModel(
            {
              type: provider.type,
              apiKey: provider.apiKey,
              apiHost: provider.apiHost,
              selectedModel: provider.selectedModel
            },
            {},
            {
              acpWorkingDirectory: input.teamWorkspaceRootPath
            }
          ) as never,
          ...(Object.keys(builtInBrowserTools).length > 0 ? { tools: builtInBrowserTools } : {}),
          memory: input.sharedMemory as never,
          workspace
        })

        return {
          assistant,
          provider,
          agent,
          toolName: this.buildMemberToolName(assistant, index)
        } satisfies TeamMemberRuntime
      })
    )

    return entries.filter((entry): entry is TeamMemberRuntime => entry !== null)
  }

  private buildSupervisorInstructions(
    teamDescription: string,
    members: TeamMemberRuntime[]
  ): string {
    const normalizedDescription =
      this.toNonEmptyString(teamDescription) ?? 'Coordinate the team to answer the user request.'
    const roster = members
      .map((member) => {
        const description = this.toNonEmptyString(member.assistant.description)
        return description
          ? `- ${member.assistant.name}: ${description}`
          : `- ${member.assistant.name}`
      })
      .join('\n')
    const tools = members
      .map((member) => {
        const description = this.toNonEmptyString(member.assistant.description)
        const detail = description ? `: ${description}` : ''
        return `- ${member.toolName} -> ${member.assistant.name}${detail}`
      })
      .concat('- complete -> End the current supervisor turn without emitting raw assistant text.')
      .join('\n')

    return `${normalizedDescription}

You are the invisible supervisor coordinating a team of specialist members.
Never produce a raw assistant reply to the user. Every supervisor turn must end with a tool call.
Delegate work by calling the team-member tools whenever specialist help is useful.
Each delegation tool streams the member's work and returns a structured result with their final text plus any routing mentions.
Call complete only when no further delegation is needed for the current user turn.

Routing rules:
- Prefer the most relevant specialist tool instead of round-robin turns.
- You may revisit the same specialist multiple times in a single user turn when follow-up, refinement, or verification is needed.
- Do not assume each specialist should be used only once, and do not delegate to everyone unless it is actually useful.
- Treat inline @Name mentions from the user, delegated members, and returned mentions as strong hints for who should go next.
- If a member clearly points to the next teammate, delegate again instead of asking the user whether another round is needed.
- Keep delegating only while it adds value.
- Do not ask the user whether another round is needed when a reasonable next delegation exists.
- Unless the user explicitly asks to stop, do not call complete before at least one relevant delegation for the current request.
- When the work is done, call complete instead of replying in natural language.
- Keep internal routing concise unless the user explicitly asks about it.

Shared browser capability:
${buildBuiltInBrowserGuidance({ handoffToolAvailable: false })}

Available team members:
${roster}

Available team-member tools:
${tools}`
  }

  private buildSupervisorTools(input: {
    members: TeamMemberRuntime[]
    runId: string
    threadId: string
    profileId: string
  }) {
    const memberTools = this.buildMemberTools(input)
    const completeTool = createTool({
      id: 'complete',
      description:
        'Finish the current supervisor turn once the team has already done enough work. Do not emit any raw assistant text after calling this tool.',
      inputSchema: z.object({
        summary: z.string().trim().min(1).optional()
      }),
      outputSchema: z.object({
        kind: z.literal('team-complete'),
        status: z.literal('complete'),
        summary: z.string().nullable()
      }),
      execute: async ({ summary }) =>
        ({
          kind: 'team-complete',
          status: 'complete',
          summary: this.toNonEmptyString(summary)
        }) satisfies TeamCompletionToolResult
    })

    return {
      ...memberTools,
      complete: completeTool
    }
  }

  private buildMemberInstructions(input: {
    assistant: AppAssistant
    teamDescription: string
    teamMembers: AppAssistant[]
  }): string {
    const baseInstructions =
      this.toNonEmptyString(input.assistant.instructions) ?? 'You are a helpful team member.'
    const normalizedDescription =
      this.toNonEmptyString(input.teamDescription) ?? 'Coordinate with the team to help the user.'
    const roster = input.teamMembers
      .filter((member) => member.id !== input.assistant.id)
      .map((member) => {
        const description = this.toNonEmptyString(member.description)
        return description ? `- ${member.name}: ${description}` : `- ${member.name}`
      })
      .join('\n')

    return `${baseInstructions}

Team context:
- You are working inside a supervised team, not alone.
- The supervisor is your immediate collaborator and will call you when your expertise is needed.
- Team goal: ${normalizedDescription}

Working rules:
- Do the part of the task that best matches your expertise and report back to the supervisor.
- If another teammate should act next, mention them inline as @Name in your final response.
- Only mention teammates from the roster below, and do not mention yourself.
- If no handoff is needed, do not invent a mention.
- Keep your update actionable and grounded in the work you performed.

Browser capability:
${buildBuiltInBrowserGuidance({
  handoffToolAvailable: Boolean(this.options.builtInBrowserManager)
})}

Available teammates:
${roster.length > 0 ? roster : '- No other teammates are available.'}`
  }

  private buildMemberToolName(assistant: AppAssistant, index: number): string {
    const base = assistant.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    return `delegate_to_${base || 'member'}_${index + 1}`
  }

  private buildMemberTools(input: {
    members: TeamMemberRuntime[]
    runId: string
    threadId: string
    profileId: string
  }) {
    const teamRoster: TeamMemberIdentity[] = input.members.map((member) => ({
      assistantId: member.assistant.id,
      name: member.assistant.name
    }))

    return Object.fromEntries(
      input.members.map((member) => {
        const tool = createTool({
          id: member.toolName,
          description: [
            `Delegate a specialist subtask to ${member.assistant.name}.`,
            this.toNonEmptyString(member.assistant.description),
            'This streams the member output live and returns their final response plus routing mentions.'
          ]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(' '),
          inputSchema: z.object({
            task: z.string().trim().min(1),
            reason: z.string().trim().min(1).optional()
          }),
          outputSchema: z.object({
            kind: z.literal('team-member-result'),
            assistantId: z.string(),
            assistantName: z.string(),
            task: z.string(),
            text: z.string(),
            mentions: z.array(z.string()),
            mentionNames: z.array(z.string()),
            subAgentThreadId: z.string().nullable(),
            subAgentResourceId: z.string().nullable()
          }),
          execute: async ({ task }, context) => {
            const delegationIndex =
              this.options.statusStore
                .getEvents(input.runId)
                .filter((event) => event.type === 'delegation-started').length + 1
            const subAgentThreadId = `${input.threadId}:${member.assistant.id}:${randomUUID()}`
            const subAgentResourceId = `${input.profileId}:${member.assistant.id}`

            this.options.statusStore.append(input.runId, {
              type: 'delegation-started',
              data: {
                primitiveId: member.assistant.id,
                primitiveType: 'tool',
                iteration: delegationIndex,
                assistantName: member.assistant.name,
                toolName: member.toolName
              }
            })

            const stream = await member.agent.stream([{ role: 'user', content: task }] as never, {
              requestContext: context.requestContext,
              maxSteps: member.assistant.maxSteps,
              modelSettings: createDefaultModelSettings(),
              providerOptions: this.buildProviderOptions(member.provider),
              memory: {
                resource: subAgentResourceId,
                thread: subAgentThreadId,
                options: {
                  lastMessages: false
                }
              }
            } satisfies AgentExecutionOptions)

            const text = await this.streamTeamMemberOutput({
              stream: stream.fullStream as ReadableStream<unknown>,
              writer: (context.writer ?? undefined) as WritableStream<unknown> | undefined
            })
            const mentions = extractMentionedAssistantIds(
              text,
              teamRoster.filter((candidate) => candidate.assistantId !== member.assistant.id)
            )
            const mentionNames = mentions.map(
              (assistantId) =>
                teamRoster.find((candidate) => candidate.assistantId === assistantId)?.name ??
                assistantId
            )
            const result: TeamMemberToolResult = {
              kind: 'team-member-result',
              assistantId: member.assistant.id,
              assistantName: member.assistant.name,
              task,
              text,
              mentions,
              mentionNames,
              subAgentThreadId,
              subAgentResourceId
            }

            this.options.statusStore.append(input.runId, {
              type: 'delegation-finished',
              data: {
                primitiveId: member.assistant.id,
                primitiveType: 'tool',
                iteration: delegationIndex,
                assistantName: member.assistant.name,
                toolName: member.toolName,
                result: text,
                mentions,
                mentionNames,
                subAgentThreadId,
                subAgentResourceId
              }
            })

            return result
          }
        })

        return [member.toolName, tool] as const
      })
    )
  }

  private didSupervisorCompleteTurn(context: {
    toolCalls?: unknown
    toolResults?: unknown
  }): boolean {
    const toolCalls = Array.isArray(context.toolCalls) ? context.toolCalls : []
    if (
      toolCalls.some(
        (toolCall) =>
          toolCall &&
          typeof toolCall === 'object' &&
          (toolCall as { name?: unknown }).name === 'complete'
      )
    ) {
      return true
    }

    const toolResults = Array.isArray(context.toolResults) ? context.toolResults : []
    return toolResults.some(
      (toolResult) =>
        toolResult &&
        typeof toolResult === 'object' &&
        (toolResult as { name?: unknown }).name === 'complete'
    )
  }

  private async streamTeamMemberOutput(input: {
    stream: ReadableStream<unknown>
    writer?: WritableStream<unknown>
  }): Promise<string> {
    if (!input.writer) {
      return this.collectTeamMemberText(input.stream)
    }

    const [streamForWriter, streamForCollection] = input.stream.tee()
    const [text] = await Promise.all([
      this.collectTeamMemberText(streamForCollection),
      streamForWriter.pipeTo(input.writer)
    ])

    return text
  }

  private async collectTeamMemberText(stream: ReadableStream<unknown>): Promise<string> {
    const reader = stream.getReader()
    let text = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          return text.trim()
        }

        const delta = this.extractTeamMemberTextDelta(value)
        if (delta) {
          text += delta
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private extractTeamMemberTextDelta(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return ''
    }

    const chunk = value as {
      type?: unknown
      payload?: {
        text?: unknown
      }
      textDelta?: unknown
    }
    if (chunk.type !== 'text-delta') {
      return ''
    }

    if (typeof chunk.payload?.text === 'string') {
      return chunk.payload.text
    }

    return typeof chunk.textDelta === 'string' ? chunk.textDelta : ''
  }

  private async syncGeneratedThreadTitle(params: {
    threadId: string
    profileId: string
  }): Promise<void> {
    const appThread = await this.options.teamThreadsRepo.getById(params.threadId)
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

    await this.options.teamThreadsRepo.updateTitle(params.threadId, generatedTitle)
  }

  private shouldReplaceThreadTitle(title: string): boolean {
    const normalizedTitle = title.trim()
    if (normalizedTitle.length === 0) {
      return true
    }

    return /^New Team Thread(?: \d+)?$/i.test(normalizedTitle)
  }

  private streamWithRunSync(
    stream: ReadableStream<UIMessageChunk>,
    params: { threadId: string; runId: string; profileId: string }
  ): ReadableStream<UIMessageChunk> {
    const reader = stream.getReader()
    let finalized = false

    const finalize = async (status: 'finished' | 'failed', error?: unknown): Promise<void> => {
      if (finalized) {
        return
      }
      finalized = true

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      await this.options.teamThreadsRepo
        .touchLastMessageAt(params.threadId, now)
        .catch(() => undefined)

      if (status === 'failed') {
        this.options.statusStore.failRun(
          params.runId,
          error instanceof Error ? error.message : 'Team run failed'
        )
        return
      }

      await this.syncGeneratedThreadTitle({
        threadId: params.threadId,
        profileId: params.profileId
      }).catch(() => undefined)

      this.options.statusStore.finishRun(params.runId)
    }

    return new ReadableStream<UIMessageChunk>({
      pull: async (controller) => {
        try {
          const { done, value } = await reader.read()
          if (done) {
            await finalize('finished')
            controller.close()
            reader.releaseLock()
            return
          }

          controller.enqueue(value)
        } catch (error) {
          await finalize('failed', error)
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

        await finalize('finished')
      }
    })
  }

  private async buildWorkspace(
    workspaceRootPath: string,
    skillsConfig: JsonObject
  ): Promise<Workspace> {
    const rootPath = path.resolve(workspaceRootPath)
    const skillsPaths = this.resolveSkillsPaths(rootPath, skillsConfig)
    const filesystem = new LocalFilesystem({
      basePath: rootPath,
      instructions: createContainedLocalFilesystemInstructions(rootPath)
    })
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

    return [...new Set(rawPaths)]
  }

  private toStringList(value: unknown): string[] {
    if (typeof value === 'string') {
      const normalized = value.trim()
      return normalized.length > 0 ? [normalized] : []
    }

    if (!Array.isArray(value)) {
      return []
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  private buildProviderOptions(provider: {
    type: string
    apiHost?: string | null
  }): AgentExecutionOptions['providerOptions'] {
    return buildOpenAIProviderOptions(provider)
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
}

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import type { AgentExecutionOptions } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { toAISdkStream as toAISdkV5Stream } from '@mastra/ai-sdk'
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'
import { Memory } from '@mastra/memory'
import type { UIMessage, UIMessageChunk } from 'ai'
import type { AppAssistant, AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { TeamThreadsRepository } from '../persistence/repos/team-threads-repo'
import type { TeamWorkspacesRepository } from '../persistence/repos/team-workspaces-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { TeamRunStatusStore } from '../server/chat/team-run-status-store'
import { resolveModel } from './model-resolver'
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
}

type JsonObject = Record<string, unknown>

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

    const memberAgents = await this.buildRunnableMemberAgents({
      assistants: liveAssistants,
      teamWorkspaceRootPath: workspace.rootPath
    })
    if (Object.keys(memberAgents).length === 0) {
      throw new ChatRouteError(
        409,
        'team_not_ready',
        'Team must include at least one runnable live assistant'
      )
    }

    const supervisorWorkspace = await this.buildWorkspace(workspace.rootPath, {})
    const storage = this.options.mastra.getStorage()
    const memory = new Memory({
      ...(storage ? { storage } : {}),
      options: {
        generateTitle: true
      }
    })

    const supervisor = new Agent({
      id: `team-supervisor:${thread.id}`,
      name: 'Team Supervisor',
      instructions: this.buildSupervisorInstructions(workspace.teamDescription, liveAssistants),
      model: resolveModel({
        type: supervisorProvider.type,
        apiKey: supervisorProvider.apiKey,
        apiHost: supervisorProvider.apiHost,
        selectedModel: supervisorModel
      }) as never,
      agents: memberAgents,
      memory: memory as never,
      workspace: supervisorWorkspace
    })

    const runId = randomUUID()
    this.options.statusStore.startRun({ runId, threadId: thread.id })

    try {
      const stream = await supervisor.stream(params.messages as never, {
        providerOptions: this.buildProviderOptions(supervisorProvider.type),
        memory: {
          thread: thread.id,
          resource: params.profileId,
          options: {
            generateTitle: true
          }
        },
        runId,
        abortSignal: params.abortSignal,
        delegation: {
          onDelegationStart: async (context) => {
            this.options.statusStore.append(runId, {
              type: 'delegation-started',
              data: {
                primitiveId: context.primitiveId,
                primitiveType: context.primitiveType,
                iteration: context.iteration
              }
            })
          },
          onDelegationComplete: async (context) => {
            this.options.statusStore.append(runId, {
              type: 'delegation-finished',
              data: {
                primitiveId: context.primitiveId,
                primitiveType: context.primitiveType,
                iteration: context.iteration,
                result: context.result.text
              }
            })
          }
        },
        onIterationComplete: async (context) => {
          this.options.statusStore.append(runId, {
            type: 'iteration-complete',
            data: {
              iteration: Number(context['iteration'] ?? 0),
              text: typeof context['text'] === 'string' ? context['text'] : undefined
            }
          })
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

  private async buildRunnableMemberAgents(input: {
    assistants: AppAssistant[]
    teamWorkspaceRootPath: string
  }): Promise<Record<string, Agent>> {
    const entries = await Promise.all(
      input.assistants.map(async (assistant) => {
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

        const agent = new Agent({
          id: assistant.id,
          name: assistant.name,
          description: this.toNonEmptyString(assistant.description) ?? undefined,
          instructions: assistant.instructions || 'You are a helpful team member.',
          model: resolveModel({
            type: provider.type,
            apiKey: provider.apiKey,
            apiHost: provider.apiHost,
            selectedModel: provider.selectedModel
          }) as never,
          workspace
        })

        return [assistant.id, agent] as const
      })
    )

    return Object.fromEntries(
      entries.filter((entry): entry is readonly [string, Agent] => entry !== null)
    )
  }

  private buildSupervisorInstructions(teamDescription: string, assistants: AppAssistant[]): string {
    const normalizedDescription =
      this.toNonEmptyString(teamDescription) ?? 'Coordinate the team to answer the user request.'
    const roster = assistants
      .map((assistant) => {
        const description = this.toNonEmptyString(assistant.description)
        return description ? `- ${assistant.name}: ${description}` : `- ${assistant.name}`
      })
      .join('\n')

    return `${normalizedDescription}\n\nAvailable team members:\n${roster}`
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

  private buildProviderOptions(providerType: string): AgentExecutionOptions['providerOptions'] {
    if (providerType !== 'openai-response') {
      return undefined
    }

    return {
      openai: {
        store: false
      }
    }
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
}

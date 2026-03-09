import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type {
  AppAssistantHeartbeat,
  AssistantHeartbeatsRepository
} from '../persistence/repos/assistant-heartbeats-repo'
import type { AppThread, ThreadsRepository } from '../persistence/repos/threads-repo'

const DEFAULT_HEARTBEAT_THREAD_RESOURCE_ID = 'default-profile'
const DEFAULT_HEARTBEAT_THREAD_TITLE = 'Heartbeat'

export class AssistantHeartbeatsServiceError extends Error {
  constructor(
    public readonly statusCode: 400 | 404,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AssistantHeartbeatsServiceError'
  }
}

export function isAssistantHeartbeatsServiceError(
  error: unknown
): error is AssistantHeartbeatsServiceError {
  return error instanceof AssistantHeartbeatsServiceError
}

type AssistantHeartbeatsServiceOptions = {
  heartbeatsRepo: Pick<
    AssistantHeartbeatsRepository,
    'getByAssistantId' | 'upsertForAssistant' | 'update'
  >
  assistantsRepo: Pick<AssistantsRepository, 'getById'>
  threadsRepo: Pick<ThreadsRepository, 'getById' | 'create'>
  reloadScheduler?: () => Promise<void>
}

export type UpsertAssistantHeartbeatConfigInput = {
  assistantId: string
  enabled: boolean
  intervalMinutes: number
  prompt: string
}

function hasWorkspaceRootPath(workspaceConfig: Record<string, unknown>): boolean {
  return typeof workspaceConfig.rootPath === 'string' && workspaceConfig.rootPath.trim().length > 0
}

export class AssistantHeartbeatsService {
  constructor(private readonly options: AssistantHeartbeatsServiceOptions) {}

  async getAssistantHeartbeat(assistantId: string): Promise<AppAssistantHeartbeat | null> {
    await this.assertAssistantSupportsHeartbeat(assistantId)
    return this.options.heartbeatsRepo.getByAssistantId(assistantId)
  }

  async upsertHeartbeat(
    input: UpsertAssistantHeartbeatConfigInput
  ): Promise<AppAssistantHeartbeat> {
    await this.assertAssistantSupportsHeartbeat(input.assistantId)

    const heartbeat = await this.options.heartbeatsRepo.upsertForAssistant({
      assistantId: input.assistantId,
      enabled: input.enabled,
      intervalMinutes: input.intervalMinutes,
      prompt: input.prompt
    })
    const thread = await this.ensureHeartbeatThread(input.assistantId, heartbeat.id)

    if (heartbeat.threadId !== thread.id) {
      const updatedHeartbeat = await this.options.heartbeatsRepo.update(heartbeat.id, {
        threadId: thread.id
      })

      if (!updatedHeartbeat) {
        throw new Error('Failed to update assistant heartbeat thread')
      }
    }

    return this.reloadAndReadHeartbeat(input.assistantId)
  }

  async ensureHeartbeatThread(assistantId: string, heartbeatId: string): Promise<AppThread> {
    const heartbeat = await this.options.heartbeatsRepo.getByAssistantId(assistantId)
    if (!heartbeat || heartbeat.id !== heartbeatId) {
      throw new AssistantHeartbeatsServiceError(
        404,
        'heartbeat_not_found',
        'Assistant heartbeat not found'
      )
    }

    if (heartbeat.threadId) {
      const existingThread = await this.options.threadsRepo.getById(heartbeat.threadId)
      if (existingThread) {
        return existingThread
      }
    }

    return this.options.threadsRepo.create({
      assistantId,
      resourceId: DEFAULT_HEARTBEAT_THREAD_RESOURCE_ID,
      title: DEFAULT_HEARTBEAT_THREAD_TITLE,
      metadata: {
        system: true,
        systemType: 'heartbeat',
        heartbeatId
      }
    })
  }

  private async assertAssistantSupportsHeartbeat(assistantId: string): Promise<void> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new AssistantHeartbeatsServiceError(404, 'assistant_not_found', 'Assistant not found')
    }

    if (!hasWorkspaceRootPath(assistant.workspaceConfig)) {
      throw new AssistantHeartbeatsServiceError(
        400,
        'assistant_workspace_required',
        'Assistant workspace is required for heartbeat'
      )
    }
  }

  private async reloadAndReadHeartbeat(assistantId: string): Promise<AppAssistantHeartbeat> {
    await this.reloadScheduler()

    const latestHeartbeat = await this.options.heartbeatsRepo.getByAssistantId(assistantId)
    if (!latestHeartbeat) {
      throw new AssistantHeartbeatsServiceError(
        404,
        'heartbeat_not_found',
        'Assistant heartbeat not found'
      )
    }

    return latestHeartbeat
  }

  private async reloadScheduler(): Promise<void> {
    await this.options.reloadScheduler?.()
  }
}

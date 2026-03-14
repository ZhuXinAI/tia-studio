import { randomUUID } from 'node:crypto'
import { GroupEventBus } from '../groups/group-event-bus'
import type { GroupRunStatusStore } from '../server/chat/group-run-status-store'
import type { GroupThreadEventsStore } from '../server/chat/group-thread-events-store'
import type {
  AppGroupThreadMessage,
  GroupThreadsRepository
} from '../persistence/repos/group-threads-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { logger } from '../utils/logger'

export type GroupRuntime = {
  submitWatcherMessage(params: {
    threadId: string
    profileId: string
    content: string
    mentions?: string[]
  }): Promise<{ runId: string; messageId: string }>
  listGroupThreadMessages(params: {
    threadId: string
    profileId: string
  }): Promise<AppGroupThreadMessage[]>
}

type GroupRuntimeServiceOptions = {
  groupThreadsRepo: GroupThreadsRepository
  bus: GroupEventBus
  statusStore: GroupRunStatusStore
  threadEventsStore: GroupThreadEventsStore
}

export class GroupRuntimeService implements GroupRuntime {
  constructor(private readonly options: GroupRuntimeServiceOptions) {}

  async submitWatcherMessage(params: {
    threadId: string
    profileId: string
    content: string
    mentions?: string[]
  }): Promise<{ runId: string; messageId: string }> {
    logger.info('[GroupFlow] Received watcher group message', {
      threadId: params.threadId,
      profileId: params.profileId,
      mentionIds: params.mentions ?? [],
      contentLength: params.content.length
    })

    const thread = await this.assertValidThread(params.threadId, params.profileId)
    const message = await this.options.groupThreadsRepo.appendMessage({
      threadId: thread.id,
      role: 'user',
      authorType: 'watcher',
      authorName: 'You',
      content: params.content,
      mentions: params.mentions ?? []
    })

    this.options.threadEventsStore.appendMessageCreated({
      threadId: thread.id,
      profileId: params.profileId,
      messageId: message.id
    })

    const runId = randomUUID()
    this.options.statusStore.startRun({
      runId,
      threadId: thread.id
    })

    logger.info('[GroupFlow] Watcher message persisted and run started', {
      runId,
      threadId: thread.id,
      profileId: params.profileId,
      messageId: message.id
    })

    await this.options.bus.publish('group.run.requested', {
      runId,
      groupThreadId: thread.id,
      profileId: params.profileId,
      triggerMessageId: message.id
    })

    logger.info('[GroupFlow] Published group run request', {
      runId,
      groupThreadId: thread.id,
      profileId: params.profileId,
      triggerMessageId: message.id
    })

    return {
      runId,
      messageId: message.id
    }
  }

  async listGroupThreadMessages(params: {
    threadId: string
    profileId: string
  }): Promise<AppGroupThreadMessage[]> {
    const thread = await this.assertValidThread(params.threadId, params.profileId)
    return this.options.groupThreadsRepo.listMessages(thread.id)
  }

  private async assertValidThread(threadId: string, profileId: string) {
    const thread = await this.options.groupThreadsRepo.getById(threadId)
    if (!thread || thread.resourceId !== profileId) {
      throw new ChatRouteError(404, 'group_thread_not_found', 'Group thread not found')
    }

    return thread
  }
}

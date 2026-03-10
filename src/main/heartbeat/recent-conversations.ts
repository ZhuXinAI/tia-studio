import type { Mastra } from '@mastra/core/mastra'
import type { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import type { ThreadsRepository, AppThread } from '../persistence/repos/threads-repo'

export type RecentConversation = {
  threadId: string
  channelId: string
  remoteChatId: string
  lastUserMessageAt: string
  minutesSinceActivity: number
}

type ListRecentConversationsInput = {
  assistantId: string
  threadsRepo: Pick<ThreadsRepository, 'listByAssistant'>
  channelThreadBindingsRepo: Pick<ChannelThreadBindingsRepository, 'listByThreadIds'>
  mastra: Pick<Mastra, 'getStorage'>
  now?: Date
}

function isHiddenThread(thread: AppThread): boolean {
  return thread.metadata.system === true || thread.metadata.cron === true
}

function parseMessageTimestamp(message: Record<string, unknown>): Date | null {
  const candidates = [message.createdAt, message.created_at, message.updatedAt, message.updated_at]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }

    const parsed = new Date(candidate)
    if (Number.isFinite(parsed.getTime())) {
      return parsed
    }
  }

  return null
}

function resolveLastUserMessageAt(messages: unknown[]): Date | null {
  let latestMessageAt: Date | null = null

  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== 'object') {
      continue
    }

    const message = rawMessage as Record<string, unknown>
    if (message.role !== 'user') {
      continue
    }

    const timestamp = parseMessageTimestamp(message)
    if (!timestamp) {
      continue
    }

    if (!latestMessageAt || timestamp > latestMessageAt) {
      latestMessageAt = timestamp
    }
  }

  return latestMessageAt
}

export async function listRecentConversations(
  input: ListRecentConversationsInput
): Promise<RecentConversation[]> {
  const threads = (
    await input.threadsRepo.listByAssistant(input.assistantId, { includeHidden: true })
  ).filter((thread) => !isHiddenThread(thread))

  if (threads.length === 0) {
    return []
  }

  const bindings = await input.channelThreadBindingsRepo.listByThreadIds(
    threads.map((thread) => thread.id)
  )
  if (bindings.length === 0) {
    return []
  }

  const bindingByThreadId = new Map(bindings.map((binding) => [binding.threadId, binding]))
  const storage = input.mastra.getStorage()
  if (!storage) {
    return []
  }

  const memoryStore = await storage.getStore('memory')
  if (!memoryStore || typeof memoryStore.listMessages !== 'function') {
    return []
  }

  const now = input.now ?? new Date()
  const recentConversations: RecentConversation[] = []

  for (const thread of threads) {
    const binding = bindingByThreadId.get(thread.id)
    if (!binding) {
      continue
    }

    const response = await memoryStore.listMessages({
      threadId: thread.id,
      resourceId: thread.resourceId,
      perPage: false
    })
    const messages = Array.isArray(response?.messages) ? response.messages : []
    const lastUserMessageAt = resolveLastUserMessageAt(messages)
    if (!lastUserMessageAt) {
      continue
    }

    recentConversations.push({
      threadId: thread.id,
      channelId: binding.channelId,
      remoteChatId: binding.remoteChatId,
      lastUserMessageAt: lastUserMessageAt.toISOString(),
      minutesSinceActivity: Math.max(
        0,
        Math.floor((now.getTime() - lastUserMessageAt.getTime()) / 60_000)
      )
    })
  }

  return recentConversations.sort((left, right) =>
    right.lastUserMessageAt.localeCompare(left.lastUserMessageAt)
  )
}

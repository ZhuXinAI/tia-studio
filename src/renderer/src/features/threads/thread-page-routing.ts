import type { ThreadRecord } from './threads-query'

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected request error'
}

export function routeToAssistantThreads(assistantId: string, threadId?: string): string {
  if (threadId) {
    return `/chat/${assistantId}/${threadId}`
  }

  return `/chat/${assistantId}`
}

export function createThreadTitle(existingThreads: ThreadRecord[]): string {
  return existingThreads.length === 0 ? 'New Thread' : `New Thread ${existingThreads.length + 1}`
}

export function formatThreadTimestamp(value: string | null): string {
  if (!value) {
    return 'No messages yet'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.valueOf())) {
    return 'Updated recently'
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function sortThreadsByRecentActivity(threads: ThreadRecord[]): ThreadRecord[] {
  return [...threads].sort((left, right) => {
    const leftDate = Date.parse(left.lastMessageAt ?? left.createdAt)
    const rightDate = Date.parse(right.lastMessageAt ?? right.createdAt)
    return rightDate - leftDate
  })
}

function resolveThreadActivityTimestamp(thread: ThreadRecord): number {
  const timestamp = Date.parse(thread.lastMessageAt ?? thread.createdAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

type ChatRouteSelection = {
  assistantId: string
  threadId: string | null
}

const chatSelectionStorageKey = 'tia.chat.last-thread-selection'

export function readStoredChatSelection(): ChatRouteSelection | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(chatSelectionStorageKey)
  if (!storedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(storedValue) as {
      assistantId?: unknown
      threadId?: unknown
    }
    if (typeof parsed.assistantId !== 'string' || parsed.assistantId.trim().length === 0) {
      return null
    }

    return {
      assistantId: parsed.assistantId,
      threadId: typeof parsed.threadId === 'string' && parsed.threadId.trim().length > 0 ? parsed.threadId : null
    }
  } catch {
    return null
  }
}

export function storeChatSelection(selection: ChatRouteSelection): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(chatSelectionStorageKey, JSON.stringify(selection))
}

export function findLatestThreadAcrossAssistants(
  threadsByAssistant: Array<{
    assistantId: string
    threads: ThreadRecord[]
  }>
): {
  assistantId: string
  threadId: string
} | null {
  const talkedCandidates = threadsByAssistant.flatMap(({ assistantId, threads }) =>
    threads
      .filter((thread) => Boolean(thread.lastMessageAt))
      .map((thread) => ({
        assistantId,
        threadId: thread.id,
        timestamp: resolveThreadActivityTimestamp(thread)
      }))
  )

  const orderedTalkedCandidates = [...talkedCandidates].sort((left, right) => right.timestamp - left.timestamp)
  const latestTalked = orderedTalkedCandidates.at(0)
  if (latestTalked) {
    return {
      assistantId: latestTalked.assistantId,
      threadId: latestTalked.threadId
    }
  }

  const fallbackCandidates = threadsByAssistant.flatMap(({ assistantId, threads }) =>
    threads.map((thread) => ({
      assistantId,
      threadId: thread.id,
      timestamp: resolveThreadActivityTimestamp(thread)
    }))
  )
  const orderedFallbackCandidates = [...fallbackCandidates].sort(
    (left, right) => right.timestamp - left.timestamp
  )
  const latestThread = orderedFallbackCandidates.at(0)
  if (!latestThread) {
    return null
  }

  return {
    assistantId: latestThread.assistantId,
    threadId: latestThread.threadId
  }
}

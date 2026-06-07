import type { ThreadRecord } from './threads-query'
import { i18n } from '../../i18n'

export type ThreadRouteScope =
  | {
      kind: 'chats'
    }
  | {
      kind: 'workspace'
      workspaceId: string
    }

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return i18n.t('common.errors.unexpectedRequest')
}

export function routeToThread(scope: ThreadRouteScope, threadId?: string): string {
  if (scope.kind === 'chats') {
    return threadId ? `/chat/${threadId}` : '/chat'
  }

  return threadId
    ? `/workspaces/${scope.workspaceId}/threads/${threadId}`
    : `/workspaces/${scope.workspaceId}`
}

export function routeToNewThread(scope: ThreadRouteScope): string {
  if (scope.kind === 'chats') {
    return '/chat/new'
  }

  return `/workspaces/${scope.workspaceId}/new`
}

export function createThreadTitle(): string {
  return ''
}

export function getThreadDisplayTitle(title: string | null | undefined): string {
  if (typeof title !== 'string') {
    return i18n.t('threads.sidebar.untitledThread')
  }

  const normalizedTitle = title.trim()
  return normalizedTitle.length > 0 ? normalizedTitle : i18n.t('threads.sidebar.untitledThread')
}

export function isThreadPinned(thread: ThreadRecord): boolean {
  return thread.metadata?.pinned === true
}

export function sortThreadsByRecentActivity(threads: ThreadRecord[]): ThreadRecord[] {
  return [...threads].sort((left, right) => {
    const leftPinned = isThreadPinned(left)
    const rightPinned = isThreadPinned(right)
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1
    }

    const leftDate = Date.parse(left.lastMessageAt ?? left.createdAt)
    const rightDate = Date.parse(right.lastMessageAt ?? right.createdAt)
    return rightDate - leftDate
  })
}

type ChatRouteSelection = {
  threadId: string | null
}

function getThreadSelectionStorageKey(scope: ThreadRouteScope): string {
  if (scope.kind === 'chats') {
    return 'tia.chat.last-thread-selection'
  }

  return `tia.workspace.${scope.workspaceId}.last-thread-selection`
}

export function readStoredThreadSelection(scope: ThreadRouteScope): ChatRouteSelection | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(getThreadSelectionStorageKey(scope))
  if (!storedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(storedValue) as {
      threadId?: unknown
    }

    return {
      threadId:
        typeof parsed.threadId === 'string' && parsed.threadId.trim().length > 0
          ? parsed.threadId
          : null
    }
  } catch {
    return null
  }
}

export function storeThreadSelection(scope: ThreadRouteScope, selection: ChatRouteSelection): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(getThreadSelectionStorageKey(scope), JSON.stringify(selection))
}

export function findLatestThread(threads: ThreadRecord[]): ThreadRecord | null {
  const orderedThreads = sortThreadsByRecentActivity(threads)
  return orderedThreads.at(0) ?? null
}

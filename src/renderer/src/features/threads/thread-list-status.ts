import type { AgentSessionSnapshot } from '../../../../shared/agent-runtime'

export type ThreadListStatus = 'approval-needed' | 'generating' | 'unread-completion' | null

export function isThreadGenerating(thread: AgentSessionSnapshot): boolean {
  return (
    thread.status === 'starting' ||
    thread.status === 'running' ||
    thread.status === 'recovering' ||
    thread.isCompacting
  )
}

export function getThreadListStatus(
  thread: AgentSessionSnapshot,
  hasUnreadCompletion: boolean
): ThreadListStatus {
  if (thread.pendingInteraction) return 'approval-needed'
  if (isThreadGenerating(thread)) return 'generating'
  return hasUnreadCompletion ? 'unread-completion' : null
}

export function getUnreadCompletionThreadIds(input: {
  currentUnreadThreadIds: ReadonlySet<string>
  previousThreads: ReadonlyMap<string, AgentSessionSnapshot>
  threads: AgentSessionSnapshot[]
  activeThreadId: string | null
}): Set<string> {
  const next = new Set(input.currentUnreadThreadIds)
  const currentThreadIds = new Set(input.threads.map((thread) => thread.id))

  for (const thread of input.threads) {
    const previous = input.previousThreads.get(thread.id)
    if (
      previous &&
      isThreadGenerating(previous) &&
      thread.status === 'idle' &&
      !thread.pendingInteraction &&
      thread.id !== input.activeThreadId
    ) {
      next.add(thread.id)
    }
    if (thread.id === input.activeThreadId) next.delete(thread.id)
  }

  for (const threadId of next) {
    if (!currentThreadIds.has(threadId)) next.delete(threadId)
  }

  return next
}

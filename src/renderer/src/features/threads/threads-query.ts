import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

export type ThreadUsageTotals = {
  assistantMessageCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}

export type ThreadRecord = {
  id: string
  assistantId: string
  resourceId: string
  title: string
  metadata?: Record<string, unknown>
  channelBinding?: {
    channelId: string
    remoteChatId: string
    createdAt: string
  } | null
  usageTotals?: ThreadUsageTotals | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateThreadInput = {
  assistantId: string
  workspaceId?: string
  providerOverride?: {
    providerId: string
    model: string
  }
  resourceId: string
  title: string
}

const apiClient = createApiClient()

const profileIdStorageKey = 'tia.profile.id'
const defaultProfileId = 'default-profile'

// Query keys for cache management
export const threadKeys = {
  all: ['threads'] as const,
  lists: () => [...threadKeys.all, 'list'] as const,
  list: (scope: { assistantId?: string; workspaceId?: string }) =>
    [...threadKeys.lists(), scope.workspaceId ?? '', scope.assistantId ?? ''] as const,
  detail: (id: string) => [...threadKeys.all, 'detail', id] as const
}

export function getActiveResourceId(): string {
  if (typeof window === 'undefined') {
    return defaultProfileId
  }

  const rawValue = window.localStorage.getItem(profileIdStorageKey)
  if (!rawValue || rawValue.trim().length === 0) {
    window.localStorage.setItem(profileIdStorageKey, defaultProfileId)
    return defaultProfileId
  }

  return rawValue
}

export type ListThreadsOptions = {
  workspaceId?: string
  assistantId?: string
  includeHidden?: boolean
}

export async function listThreads(options: ListThreadsOptions): Promise<ThreadRecord[]> {
  const params = new URLSearchParams()
  if (options.workspaceId) {
    params.set('workspaceId', options.workspaceId)
  }
  if (options.assistantId) {
    params.set('assistantId', options.assistantId)
  }
  if (options?.includeHidden) {
    params.set('includeHidden', 'true')
  }
  return apiClient.get<ThreadRecord[]>(`/v1/threads?${params.toString()}`)
}

export async function createThread(input: CreateThreadInput): Promise<ThreadRecord> {
  return apiClient.post<ThreadRecord>('/v1/threads', input)
}

export async function updateThreadTitle(threadId: string, title: string): Promise<ThreadRecord> {
  return apiClient.patch<ThreadRecord>(`/v1/threads/${threadId}`, { title })
}

export async function deleteThread(threadId: string): Promise<void> {
  await apiClient.delete(`/v1/threads/${threadId}`)
}

// TanStack Query hooks
export function useThreads(
  scope: { assistantId?: string; workspaceId?: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: threadKeys.list(scope),
    queryFn: () => listThreads(scope),
    enabled: options?.enabled !== false && (!!scope.assistantId || !!scope.workspaceId)
  })
}

export function useCreateThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createThread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.lists() })
    }
  })
}

export function useUpdateThreadTitle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      updateThreadTitle(threadId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.lists() })
    }
  })
}

export function useDeleteThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteThread,
    onSuccess: () => {
      // Invalidate all thread lists
      queryClient.invalidateQueries({ queryKey: threadKeys.lists() })
    }
  })
}

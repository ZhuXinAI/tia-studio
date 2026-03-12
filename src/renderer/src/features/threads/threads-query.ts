import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

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
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateThreadInput = {
  assistantId: string
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
  list: (assistantId: string) => [...threadKeys.lists(), assistantId] as const,
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
  includeHidden?: boolean
}

// Legacy functions (kept for backward compatibility during migration)
export async function listThreads(
  assistantId: string,
  options?: ListThreadsOptions
): Promise<ThreadRecord[]> {
  const params = new URLSearchParams({
    assistantId
  })
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
export function useThreads(assistantId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: threadKeys.list(assistantId ?? ''),
    queryFn: () => listThreads(assistantId!),
    enabled: options?.enabled !== false && !!assistantId
  })
}

export function useCreateThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createThread,
    onSuccess: (newThread) => {
      // Invalidate the threads list for this assistant
      queryClient.invalidateQueries({ queryKey: threadKeys.list(newThread.assistantId) })
    }
  })
}

export function useUpdateThreadTitle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      updateThreadTitle(threadId, title),
    onSuccess: (updatedThread) => {
      // Invalidate the threads list for this assistant
      queryClient.invalidateQueries({ queryKey: threadKeys.list(updatedThread.assistantId) })
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

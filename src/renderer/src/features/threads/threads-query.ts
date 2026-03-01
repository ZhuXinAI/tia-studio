import { createApiClient } from '../../lib/api-client'

export type ThreadRecord = {
  id: string
  assistantId: string
  resourceId: string
  title: string
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

export function getActiveResourceId(): string {
  const rawValue = window.localStorage.getItem(profileIdStorageKey)
  if (!rawValue || rawValue.trim().length === 0) {
    window.localStorage.setItem(profileIdStorageKey, defaultProfileId)
    return defaultProfileId
  }

  return rawValue
}

export async function listThreads(assistantId: string): Promise<ThreadRecord[]> {
  const params = new URLSearchParams({
    assistantId
  })
  return apiClient.get<ThreadRecord[]>(`/v1/threads?${params.toString()}`)
}

export async function createThread(input: CreateThreadInput): Promise<ThreadRecord> {
  return apiClient.post<ThreadRecord>('/v1/threads', input)
}

export async function updateThreadTitle(threadId: string, title: string): Promise<ThreadRecord> {
  return apiClient.patch<ThreadRecord>(`/v1/threads/${threadId}`, { title })
}

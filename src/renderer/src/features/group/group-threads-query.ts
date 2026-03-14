import { createApiClient } from '../../lib/api-client'

export type GroupThreadRecord = {
  id: string
  groupId: string
  resourceId: string
  title: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateGroupThreadInput = {
  groupId: string
  resourceId: string
  title?: string
}

export type UpdateGroupThreadInput = {
  title?: string
}

const apiClient = createApiClient()

export async function listGroupThreads(groupId: string): Promise<GroupThreadRecord[]> {
  const params = new URLSearchParams({ groupId })
  return apiClient.get<GroupThreadRecord[]>(`/v1/group/threads?${params.toString()}`)
}

export async function createGroupThread(input: CreateGroupThreadInput): Promise<GroupThreadRecord> {
  return apiClient.post<GroupThreadRecord>('/v1/group/threads', input)
}

export async function updateGroupThread(
  threadId: string,
  input: UpdateGroupThreadInput
): Promise<GroupThreadRecord> {
  return apiClient.patch<GroupThreadRecord>(`/v1/group/threads/${threadId}`, input)
}

export async function deleteGroupThread(threadId: string): Promise<void> {
  await apiClient.delete(`/v1/group/threads/${threadId}`)
}

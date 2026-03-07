import { createApiClient } from '../../lib/api-client'

export type TeamThreadRecord = {
  id: string
  workspaceId: string
  resourceId: string
  title: string
  teamDescription: string
  supervisorProviderId: string | null
  supervisorModel: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type TeamThreadMemberRecord = {
  teamThreadId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}

export type CreateTeamThreadInput = {
  workspaceId: string
  resourceId: string
  title: string
}

export type UpdateTeamThreadInput = {
  title?: string
  teamDescription?: string
  supervisorProviderId?: string | null
  supervisorModel?: string
}

const apiClient = createApiClient()

export async function listTeamThreads(workspaceId: string): Promise<TeamThreadRecord[]> {
  const params = new URLSearchParams({ workspaceId })
  return apiClient.get<TeamThreadRecord[]>(`/v1/team/threads?${params.toString()}`)
}

export async function listTeamThreadMembers(threadId: string): Promise<TeamThreadMemberRecord[]> {
  return apiClient.get<TeamThreadMemberRecord[]>(`/v1/team/threads/${threadId}/members`)
}

export async function createTeamThread(input: CreateTeamThreadInput): Promise<TeamThreadRecord> {
  return apiClient.post<TeamThreadRecord>('/v1/team/threads', input)
}

export async function updateTeamThread(
  threadId: string,
  input: UpdateTeamThreadInput
): Promise<TeamThreadRecord> {
  return apiClient.patch<TeamThreadRecord>(`/v1/team/threads/${threadId}`, input)
}

export async function replaceTeamThreadMembers(
  threadId: string,
  assistantIds: string[]
): Promise<TeamThreadMemberRecord[]> {
  return apiClient.put<TeamThreadMemberRecord[]>(`/v1/team/threads/${threadId}/members`, {
    assistantIds
  })
}

export async function deleteTeamThread(threadId: string): Promise<void> {
  await apiClient.delete(`/v1/team/threads/${threadId}`)
}

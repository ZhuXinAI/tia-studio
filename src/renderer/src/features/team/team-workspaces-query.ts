import { createApiClient } from '../../lib/api-client'

export type TeamWorkspaceRecord = {
  id: string
  name: string
  rootPath: string
  createdAt: string
  updatedAt: string
}

export type CreateTeamWorkspaceInput = {
  name: string
  rootPath: string
}

export type UpdateTeamWorkspaceInput = Partial<CreateTeamWorkspaceInput>

const apiClient = createApiClient()

export async function listTeamWorkspaces(): Promise<TeamWorkspaceRecord[]> {
  return apiClient.get<TeamWorkspaceRecord[]>('/v1/team/workspaces')
}

export async function createTeamWorkspace(
  input: CreateTeamWorkspaceInput
): Promise<TeamWorkspaceRecord> {
  return apiClient.post<TeamWorkspaceRecord>('/v1/team/workspaces', input)
}

export async function updateTeamWorkspace(
  workspaceId: string,
  input: UpdateTeamWorkspaceInput
): Promise<TeamWorkspaceRecord> {
  return apiClient.patch<TeamWorkspaceRecord>(`/v1/team/workspaces/${workspaceId}`, input)
}

export async function deleteTeamWorkspace(workspaceId: string): Promise<void> {
  await apiClient.delete(`/v1/team/workspaces/${workspaceId}`)
}

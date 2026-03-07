import { createApiClient } from '../../lib/api-client'

export type TeamWorkspaceRecord = {
  id: string
  name: string
  rootPath: string
  teamDescription: string
  supervisorProviderId: string | null
  supervisorModel: string
  createdAt: string
  updatedAt: string
}

export type TeamWorkspaceMemberRecord = {
  workspaceId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}

export type CreateTeamWorkspaceInput = {
  name: string
  rootPath: string
}

export type UpdateTeamWorkspaceInput = Partial<CreateTeamWorkspaceInput> & {
  teamDescription?: string
  supervisorProviderId?: string | null
  supervisorModel?: string
}

const apiClient = createApiClient()

function normalizeTeamWorkspaceRecord(record: TeamWorkspaceRecord): TeamWorkspaceRecord {
  return {
    ...record,
    rootPath: typeof record.rootPath === 'string' ? record.rootPath : '',
    teamDescription: typeof record.teamDescription === 'string' ? record.teamDescription : '',
    supervisorProviderId:
      typeof record.supervisorProviderId === 'string' && record.supervisorProviderId.length > 0
        ? record.supervisorProviderId
        : null,
    supervisorModel: typeof record.supervisorModel === 'string' ? record.supervisorModel : ''
  }
}

export async function listTeamWorkspaces(): Promise<TeamWorkspaceRecord[]> {
  const records = await apiClient.get<TeamWorkspaceRecord[]>('/v1/team/workspaces')
  return records.map((record) => normalizeTeamWorkspaceRecord(record))
}

export async function createTeamWorkspace(
  input: CreateTeamWorkspaceInput
): Promise<TeamWorkspaceRecord> {
  const record = await apiClient.post<TeamWorkspaceRecord>('/v1/team/workspaces', input)
  return normalizeTeamWorkspaceRecord(record)
}

export async function updateTeamWorkspace(
  workspaceId: string,
  input: UpdateTeamWorkspaceInput
): Promise<TeamWorkspaceRecord> {
  const record = await apiClient.patch<TeamWorkspaceRecord>(
    `/v1/team/workspaces/${workspaceId}`,
    input
  )
  return normalizeTeamWorkspaceRecord(record)
}

export async function listTeamWorkspaceMembers(
  workspaceId: string
): Promise<TeamWorkspaceMemberRecord[]> {
  return apiClient.get<TeamWorkspaceMemberRecord[]>(`/v1/team/workspaces/${workspaceId}/members`)
}

export async function replaceTeamWorkspaceMembers(
  workspaceId: string,
  assistantIds: string[]
): Promise<TeamWorkspaceMemberRecord[]> {
  return apiClient.put<TeamWorkspaceMemberRecord[]>(`/v1/team/workspaces/${workspaceId}/members`, {
    assistantIds
  })
}

export async function deleteTeamWorkspace(workspaceId: string): Promise<void> {
  await apiClient.delete(`/v1/team/workspaces/${workspaceId}`)
}

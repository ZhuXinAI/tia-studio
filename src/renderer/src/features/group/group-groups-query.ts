import { createApiClient } from '../../lib/api-client'

export type GroupRecord = {
  id: string
  name: string
  rootPath: string
  groupDescription: string
  maxAutoTurns: number
  createdAt: string
  updatedAt: string
}

export type GroupMemberRecord = {
  groupId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}

export type CreateGroupInput = {
  name: string
  assistantIds: string[]
}

export type UpdateGroupInput = {
  name?: string
  groupDescription?: string
  maxAutoTurns?: number
}

const apiClient = createApiClient()

function normalizeGroupRecord(record: GroupRecord): GroupRecord {
  return {
    ...record,
    rootPath: typeof record.rootPath === 'string' ? record.rootPath : '',
    groupDescription: typeof record.groupDescription === 'string' ? record.groupDescription : '',
    maxAutoTurns:
      typeof record.maxAutoTurns === 'number' && Number.isFinite(record.maxAutoTurns)
        ? record.maxAutoTurns
        : 6
  }
}

export async function listGroups(): Promise<GroupRecord[]> {
  const records = await apiClient.get<GroupRecord[]>('/v1/group/groups')
  return records.map((record) => normalizeGroupRecord(record))
}

export async function createGroup(input: CreateGroupInput): Promise<GroupRecord> {
  const record = await apiClient.post<GroupRecord>('/v1/group/groups', input)
  return normalizeGroupRecord(record)
}

export async function updateGroup(groupId: string, input: UpdateGroupInput): Promise<GroupRecord> {
  const record = await apiClient.patch<GroupRecord>(`/v1/group/groups/${groupId}`, input)
  return normalizeGroupRecord(record)
}

export async function listGroupMembers(groupId: string): Promise<GroupMemberRecord[]> {
  return apiClient.get<GroupMemberRecord[]>(`/v1/group/groups/${groupId}/members`)
}

export async function replaceGroupMembers(
  groupId: string,
  assistantIds: string[]
): Promise<GroupMemberRecord[]> {
  return apiClient.put<GroupMemberRecord[]>(`/v1/group/groups/${groupId}/members`, { assistantIds })
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/v1/group/groups/${groupId}`)
}

export type AgentMemory = {
  id: string
  workspaceId: string | null
  title: string
  content: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type SaveAgentMemoryInput = {
  workspaceId: string | null
  title: string
  content: string
  enabled: boolean
}

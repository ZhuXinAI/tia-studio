export type AgentArtifactKind =
  | 'file'
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'webpage'
  | 'text'
  | 'tool-output'

export type AgentArtifact = {
  id: string
  sessionId: string
  name: string
  kind: AgentArtifactKind
  mimeType?: string
  relativePath?: string
  url?: string
  sizeBytes?: number
  previewText?: string
  sourceMessageId?: string
  sourceToolCallId?: string
  sourceToolName?: string
  createdAt: string
}

export type CreateAgentArtifactInput = Omit<AgentArtifact, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: string
}

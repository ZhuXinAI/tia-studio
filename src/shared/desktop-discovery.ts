export type DesktopSkillSource =
  | 'global-codex'
  | 'global-claude'
  | 'global-agent'
  | 'global-agent-legacy'
  | 'workspace'

export type DesktopSkillRecord = {
  id: string
  name: string
  description: string | null
  source: DesktopSkillSource
  sourceRootPath: string
  directoryPath: string
  relativePath: string
  skillFilePath: string
  canDelete: boolean
}

export type DesktopSkillCatalogQuery = {
  cursor?: string
  limit?: number
  search?: string
  source?: DesktopSkillSource
}

export type DesktopSkillSourceCounts = Record<DesktopSkillSource, number>

export type DesktopSkillCatalogPage = {
  skills: DesktopSkillRecord[]
  totalCount: number
  sourceCounts: DesktopSkillSourceCounts
  nextCursor: string | null
}

export type DesktopAutomationRecord = {
  id: string
  kind: string | null
  name: string
  prompt: string | null
  status: string | null
  rrule: string | null
  model: string | null
  reasoningEffort: string | null
  executionEnvironment: string | null
  cwds: string[]
  createdAt: string | null
  updatedAt: string | null
  directoryPath: string
  filePath: string
}

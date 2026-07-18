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

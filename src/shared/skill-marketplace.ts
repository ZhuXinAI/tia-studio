export type SkillInstallScope = 'global' | 'workspace'

export type SkillMarketplaceRecord = {
  id: string
  rank: number
  slug: string
  name: string
  source: string
  installs: number
  installedGlobal: boolean
  installedWorkspace: boolean
}

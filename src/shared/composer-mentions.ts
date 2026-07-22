export type ComposerMentionSkill = {
  id: string
  name: string
  description: string | null
  source: string
  relativePath: string
}

export type ComposerMentionFile = {
  relativePath: string
  name: string
}

export type ComposerMentions = {
  skills: ComposerMentionSkill[]
  files: ComposerMentionFile[]
}

export type GitChangeKind = 'staged' | 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export type GitChange = {
  path: string
  status: string
  kind: GitChangeKind
  staged: boolean
  worktree: boolean
}

export type GitReview = {
  isRepository: boolean
  branch: string | null
  ahead: number
  behind: number
  changes: GitChange[]
  diff: string
  checkedAt: string
}

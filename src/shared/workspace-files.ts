export const workspaceFileLimits = {
  maxDirectoryEntries: 500,
  maxTextFileBytes: 1_048_576
} as const

export type WorkspaceFileKind = 'directory' | 'file'

export type WorkspaceFileEntry = {
  name: string
  relativePath: string
  kind: WorkspaceFileKind
}

export type WorkspaceDirectory = {
  relativePath: string
  entries: WorkspaceFileEntry[]
  truncated: boolean
}

export type WorkspaceFileContent = {
  name: string
  relativePath: string
  content: string
  sha256: string
  sizeBytes: number
}

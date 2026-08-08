export type PythonInterpreter = {
  command: string
  executable: string
  version: string
  source: 'workspace' | 'path'
}

export type PythonProjectInfo = {
  workspacePath: string
  interpreter: PythonInterpreter | null
  projectFiles: string[]
  hasVirtualEnvironment: boolean
  recommendedChecks: Array<'compile' | 'pytest'>
  inspectedAt: string
}

export type PythonCheckKind = 'compile' | 'pytest'

export type PythonCheckResult = {
  kind: PythonCheckKind
  passed: boolean
  exitCode: number | null
  output: string
  durationMs: number
  completedAt: string
}

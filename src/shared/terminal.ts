export type TerminalRunStatus = 'running' | 'exited' | 'failed' | 'stopped'
export type TerminalOutputStream = 'stdout' | 'stderr'

export type TerminalRun = {
  id: string
  sessionId: string
  command: string
  cwd: string
  status: TerminalRunStatus
  output: string
  startedAt: string
  endedAt?: string
  exitCode?: number | null
}

export type TerminalEvent =
  | {
      type: 'output'
      sequence: number
      stream: TerminalOutputStream
      text: string
    }
  | {
      type: 'state'
      sequence: number
      run: TerminalRun
    }

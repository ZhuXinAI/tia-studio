export type TerminalRunStatus = 'running' | 'exited' | 'failed' | 'stopped'
export type TerminalOutputStream = 'stdout' | 'stderr'

export type TerminalRun = {
  id: string
  sessionId: string
  command: string
  cwd: string
  pid?: number
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

export type TerminalClientEvent =
  | {
      type: 'input'
      data: string
    }
  | {
      type: 'resize'
      cols: number
      rows: number
    }

export type TerminalSocketEvent =
  | {
      type: 'snapshot'
      data: string
      run: TerminalRun
    }
  | {
      type: 'output'
      data: string
    }
  | {
      type: 'state'
      run: TerminalRun
    }
  | {
      type: 'error'
      message: string
    }

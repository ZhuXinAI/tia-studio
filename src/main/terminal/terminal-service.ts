import { constants } from 'node:fs'
import { access, chmod } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'
import type {
  TerminalEvent,
  TerminalOutputStream,
  TerminalRun,
  TerminalRunStatus
} from '../../shared/terminal'

const MAX_COMMAND_LENGTH = 8_000
const MAX_OUTPUT_LENGTH = 256_000
const STOP_GRACE_MS = 2_500
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const MIN_COLS = 20
const MAX_COLS = 240
const MIN_ROWS = 8
const MAX_ROWS = 120

const require = createRequire(import.meta.url)

type Listener = (event: TerminalEvent) => void
type TerminalEventPayload =
  | { type: 'output'; stream: TerminalOutputStream; text: string }
  | { type: 'state'; run: TerminalRun }

type LiveRun = TerminalRun & {
  pty: IPty
  listeners: Set<Listener>
  nextSequence: number
  stopRequested: boolean
  stopTimer?: ReturnType<typeof setTimeout>
  resolveCompletion: () => void
  completion: Promise<void>
}

function isWithin(root: string, candidate: string): boolean {
  const rootPath = resolve(root)
  const candidatePath = resolve(candidate)
  const relativePath = relative(rootPath, candidatePath)
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
}

function clampDimension(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  return Math.min(max, Math.max(min, Math.floor(value ?? fallback)))
}

async function ensureNodePtyHelperExecutable(): Promise<void> {
  if (process.platform !== 'darwin') return

  const packageEntry = require.resolve('node-pty') as string
  const helperPath = resolve(
    dirname(packageEntry),
    '..',
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  )

  try {
    await access(helperPath, constants.X_OK)
    return
  } catch {
    // Some package managers preserve the helper's contents but drop its executable bit.
  }

  await chmod(helperPath, 0o755)
}

function resolveShell(): { command: string; args: string[]; label: string } {
  if (process.platform === 'win32') {
    const command = process.env.ComSpec?.trim() || 'cmd.exe'
    return { command, args: [], label: command }
  }

  const command = process.env.SHELL?.trim() || '/bin/sh'
  return { command, args: ['-l'], label: command }
}

function snapshot(run: LiveRun): TerminalRun {
  return {
    id: run.id,
    sessionId: run.sessionId,
    command: run.command,
    cwd: run.cwd,
    ...(run.status === 'running' ? { pid: run.pty.pid } : {}),
    status: run.status,
    output: run.output,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode
  }
}

export class TerminalService {
  private readonly runs = new Map<string, LiveRun>()

  async start(input: {
    sessionId: string
    workspacePath: string
    cwd?: string
    command?: string
    cols?: number
    rows?: number
  }): Promise<TerminalRun> {
    const command = input.command?.trim() || ''
    if (command.length > MAX_COMMAND_LENGTH) throw new Error('Terminal command is too long')

    const cwd = resolve(input.workspacePath, input.cwd?.trim() || '.')
    if (!isWithin(input.workspacePath, cwd)) {
      throw new Error('Terminal directory must stay inside the workspace')
    }

    await ensureNodePtyHelperExecutable()

    const shell = resolveShell()
    const ptyCommand = shell.command
    const ptyArgs = command
      ? process.platform === 'win32'
        ? ['/d', '/s', '/c', command]
        : ['-lc', command]
      : shell.args
    const commandLabel = command || shell.label
    const cols = clampDimension(input.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS)
    const rows = clampDimension(input.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS)
    const pty = spawn(ptyCommand, ptyArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'tia-studio'
      }
    })

    let resolveCompletion: () => void = () => undefined
    const completion = new Promise<void>((resolvePromise) => {
      resolveCompletion = resolvePromise
    })
    const run: LiveRun = {
      id: randomUUID(),
      sessionId: input.sessionId,
      command: commandLabel,
      cwd,
      status: 'running',
      output: '',
      startedAt: new Date().toISOString(),
      pty,
      listeners: new Set(),
      nextSequence: 0,
      stopRequested: false,
      resolveCompletion,
      completion
    }

    this.runs.set(run.id, run)
    pty.onData((data) => this.appendOutput(run, data))
    pty.onExit((event) => {
      this.finish(
        run,
        run.stopRequested ? 'stopped' : event.exitCode === 0 ? 'exited' : 'failed',
        event.exitCode
      )
    })
    this.emitState(run)
    return snapshot(run)
  }

  get(id: string): TerminalRun | null {
    const run = this.runs.get(id)
    return run ? snapshot(run) : null
  }

  listBySession(sessionId: string): TerminalRun[] {
    return [...this.runs.values()]
      .filter((run) => run.sessionId === sessionId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .map(snapshot)
  }

  subscribe(id: string, listener: Listener): () => void {
    const run = this.runs.get(id)
    if (!run) return () => undefined
    run.listeners.add(listener)
    return () => run.listeners.delete(listener)
  }

  write(id: string, data: string): boolean {
    const run = this.runs.get(id)
    if (!run || run.status !== 'running') return false
    run.pty.write(data)
    return true
  }

  resize(id: string, cols: number, rows: number): boolean {
    const run = this.runs.get(id)
    if (!run || run.status !== 'running') return false
    run.pty.resize(
      clampDimension(cols, MIN_COLS, MAX_COLS, DEFAULT_COLS),
      clampDimension(rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS)
    )
    return true
  }

  async stop(id: string): Promise<boolean> {
    const run = this.runs.get(id)
    if (!run) return false
    if (run.status !== 'running') return true

    run.stopRequested = true
    try {
      if (process.platform === 'win32') run.pty.kill()
      else run.pty.kill('SIGTERM')
    } catch {
      // The process may have exited between the status check and the signal.
    }
    run.stopTimer = setTimeout(() => {
      if (run.status !== 'running') return
      try {
        if (process.platform === 'win32') run.pty.kill()
        else run.pty.kill('SIGKILL')
      } catch {
        // Ignore a process that has already exited.
      }
    }, STOP_GRACE_MS)
    await run.completion
    return true
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.values()].map((run) => this.stop(run.id)))
    for (const run of this.runs.values()) {
      if (run.stopTimer) clearTimeout(run.stopTimer)
    }
  }

  private appendOutput(run: LiveRun, data: string): void {
    if (run.status !== 'running') return
    run.output = `${run.output}${data}`.slice(-MAX_OUTPUT_LENGTH)
    this.emit(run, {
      type: 'output',
      stream: 'stdout',
      text: data
    })
  }

  private finish(run: LiveRun, status: TerminalRunStatus, exitCode: number | null): void {
    if (run.status !== 'running') return
    run.status = status
    run.exitCode = exitCode
    run.endedAt = new Date().toISOString()
    if (run.stopTimer) clearTimeout(run.stopTimer)
    this.emitState(run)
    run.resolveCompletion()
  }

  private emitState(run: LiveRun): void {
    this.emit(run, { type: 'state', run: snapshot(run) })
  }

  private emit(run: LiveRun, event: TerminalEventPayload): void {
    const next = { ...event, sequence: ++run.nextSequence } as TerminalEvent
    for (const listener of run.listeners) listener(next)
  }
}

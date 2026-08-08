import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { TerminalEvent, TerminalRun, TerminalRunStatus } from '../../shared/terminal'

const MAX_COMMAND_LENGTH = 8_000
const MAX_OUTPUT_LENGTH = 256_000
const STOP_GRACE_MS = 2_500

type Listener = (event: TerminalEvent) => void
type TerminalEventPayload =
  | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'state'; run: TerminalRun }

type LiveRun = TerminalRun & {
  child: ChildProcessWithoutNullStreams
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

function snapshot(run: LiveRun): TerminalRun {
  return {
    id: run.id,
    sessionId: run.sessionId,
    command: run.command,
    cwd: run.cwd,
    status: run.status,
    output: run.output,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode
  }
}

export class TerminalService {
  private readonly runs = new Map<string, LiveRun>()

  async start(input: { sessionId: string; workspacePath: string; cwd?: string; command: string }): Promise<TerminalRun> {
    const command = input.command.trim()
    if (!command) throw new Error('A terminal command is required')
    if (command.length > MAX_COMMAND_LENGTH) throw new Error('Terminal command is too long')
    const cwd = resolve(input.workspacePath, input.cwd?.trim() || '.')
    if (!isWithin(input.workspacePath, cwd)) throw new Error('Terminal directory must stay inside the workspace')

    const shell = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh'
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]
    const child = spawn(shell, args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    let resolveCompletion: () => void = () => undefined
    const completion = new Promise<void>((resolvePromise) => {
      resolveCompletion = resolvePromise
    })
    const run: LiveRun = {
      id: randomUUID(),
      sessionId: input.sessionId,
      command,
      cwd,
      status: 'running',
      output: '',
      startedAt: new Date().toISOString(),
      child,
      listeners: new Set(),
      nextSequence: 0,
      stopRequested: false,
      resolveCompletion,
      completion
    }
    this.runs.set(run.id, run)
    child.stdin.end()
    child.stdout.on('data', (chunk: Buffer | string) => this.appendOutput(run, 'stdout', chunk))
    child.stderr.on('data', (chunk: Buffer | string) => this.appendOutput(run, 'stderr', chunk))
    child.once('error', (error) => {
      this.appendOutput(run, 'stderr', `${error.message}\n`)
      this.finish(run, 'failed', null)
    })
    child.once('close', (code) => {
      this.finish(run, run.stopRequested ? 'stopped' : code === 0 ? 'exited' : 'failed', code)
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

  async stop(id: string): Promise<boolean> {
    const run = this.runs.get(id)
    if (!run) return false
    if (run.status !== 'running') return true
    run.stopRequested = true
    run.child.kill('SIGTERM')
    run.stopTimer = setTimeout(() => {
      if (run.status === 'running') run.child.kill('SIGKILL')
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

  private appendOutput(run: LiveRun, stream: 'stdout' | 'stderr', chunk: Buffer | string): void {
    if (run.status !== 'running') return
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    run.output = `${run.output}${text}`.slice(-MAX_OUTPUT_LENGTH)
    this.emit(run, { type: 'output', stream, text })
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

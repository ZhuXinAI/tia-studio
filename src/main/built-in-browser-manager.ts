import { randomUUID } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT,
  type BuiltInBrowserControlMessage,
  type BuiltInBrowserEventMessage
} from './built-in-browser-contract'
import { logger } from './utils/logger'

const DEFAULT_READY_TIMEOUT_MS = 15_000
const DEFAULT_HANDOFF_TIMEOUT_MS = 15 * 60 * 1000
const DEVTOOLS_PROBE_TIMEOUT_MS = 1_500
const DEVTOOLS_PORT_RELEASE_TIMEOUT_MS = 5_000
const DEVTOOLS_PORT_RELEASE_POLL_INTERVAL_MS = 150
const ACTIVE_PROFILE_STATE_FILENAME = 'active-profile.json'

type DevToolsPortHealth = 'absent' | 'healthy' | 'unhealthy'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parsePidListOutput(output: string): number[] {
  const pidSet = new Set<number>()
  for (const token of output.split(/\s+/)) {
    const pid = Number.parseInt(token.trim(), 10)
    if (Number.isFinite(pid) && pid > 0) {
      pidSet.add(pid)
    }
  }

  return [...pidSet]
}

function runCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true
  })

  if (typeof result.stdout !== 'string') {
    return ''
  }

  return result.stdout.trim()
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function findListeningPidsByPort(port: number): number[] {
  if (process.platform === 'win32') {
    const output = runCommand('netstat', ['-ano', '-p', 'tcp'])
    const pidSet = new Set<number>()
    for (const line of output.split('\n')) {
      const match = line.match(
        new RegExp(String.raw`^\s*TCP\s+\S+:${port}\s+\S+\s+LISTENING\s+(\d+)\s*$`, 'i')
      )
      if (!match) {
        continue
      }

      const pid = Number.parseInt(match[1] ?? '', 10)
      if (Number.isFinite(pid) && pid > 0) {
        pidSet.add(pid)
      }
    }

    return [...pidSet]
  }

  const lsofOutput = runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  const lsofPids = parsePidListOutput(lsofOutput)
  if (lsofPids.length > 0 || process.platform !== 'linux') {
    return lsofPids
  }

  const ssOutput = runCommand('ss', ['-lptn', `sport = :${port}`])
  const pidSet = new Set<number>()
  for (const match of ssOutput.matchAll(/pid=(\d+)/g)) {
    const pid = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(pid) && pid > 0) {
      pidSet.add(pid)
    }
  }

  return [...pidSet]
}

function killProcessByPid(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    })
    return
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Best effort only.
  }
}

function getErrorCode(error: unknown): string | null {
  let current: unknown = error

  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') {
      return null
    }

    if ('code' in current && typeof current.code === 'string') {
      return current.code
    }

    current = 'cause' in current ? current.cause : null
  }

  return null
}

function isPortAbsentError(error: unknown): boolean {
  const code = getErrorCode(error)
  return (
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'EADDRNOTAVAIL'
  )
}

async function probeRemoteDebuggingPort(port: number): Promise<DevToolsPortHealth> {
  const timeoutController = new AbortController()
  const timeoutHandle = setTimeout(() => timeoutController.abort(), DEVTOOLS_PROBE_TIMEOUT_MS)

  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      headers: {
        accept: 'application/json'
      },
      signal: timeoutController.signal
    })

    if (!response.ok) {
      return 'unhealthy'
    }

    const payload = await response.text()
    if (payload.trim().length === 0) {
      return 'unhealthy'
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      return 'unhealthy'
    }

    return Array.isArray(parsed) && parsed.length > 0 ? 'healthy' : 'unhealthy'
  } catch (error) {
    if (isPortAbsentError(error)) {
      return 'absent'
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return 'unhealthy'
    }

    return 'unhealthy'
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function killChildProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Best effort only.
    }
    return
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    })
    return
  }

  try {
    // Detached POSIX children become their own process group leader, so a negative pid
    // terminates Electron plus any helper processes holding the debugging port open.
    process.kill(-pid, 'SIGKILL')
    return
  } catch {
    // Fall through to a direct kill if the group is already gone.
  }

  try {
    child.kill('SIGKILL')
  } catch {
    // Best effort only.
  }
}

export type BrowserHumanHandoffRequest = {
  message: string
  buttonLabel?: string
  timeoutMs?: number
}

export type BrowserHumanHandoffResult = {
  status: 'completed' | 'timed_out'
  currentUrl: string | null
  remoteDebuggingPort: number
}

export type BuiltInBrowserController = {
  getRemoteDebuggingPort(): number
  requestHumanHandoff(input: BrowserHumanHandoffRequest): Promise<BrowserHumanHandoffResult>
}

type BuiltInBrowserManagerOptions = {
  executablePath: string
  entryPath: string
  remoteDebuggingPort?: number
  profileRootPath?: string
}

type PendingHandoff = {
  requestId: string
  resolve: (value: BrowserHumanHandoffResult) => void
  reject: (reason?: unknown) => void
  timeoutHandle: NodeJS.Timeout
}

function isEventMessage(value: unknown): value is BuiltInBrowserEventMessage {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'type' in value &&
      typeof (value as { type?: unknown }).type === 'string'
  )
}

export class BuiltInBrowserManager implements BuiltInBrowserController {
  private child: ChildProcess | null = null
  private ready = false
  private readyPromise: Promise<void> | null = null
  private launchPromise: Promise<void> | null = null
  private resolveReady: (() => void) | null = null
  private rejectReady: ((reason?: unknown) => void) | null = null
  private pendingMessages: BuiltInBrowserControlMessage[] = []
  private pendingHandoff: PendingHandoff | null = null
  private currentUrl: string | null = null
  private currentProfilePath: string | null = null

  constructor(private readonly options: BuiltInBrowserManagerOptions) {}

  getRemoteDebuggingPort(): number {
    return this.options.remoteDebuggingPort ?? BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT
  }

  async launch(): Promise<void> {
    if (this.child && !this.child.killed) {
      return
    }

    if (this.launchPromise) {
      await this.launchPromise
      return
    }

    this.launchPromise = this.launchInternal()
    try {
      await this.launchPromise
    } finally {
      this.launchPromise = null
    }
  }

  private async launchInternal(): Promise<void> {
    const profilePath = await this.prepareLaunch()

    this.ready = false
    this.pendingMessages = []
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })

    const args = [
      this.options.entryPath,
      `--remote-debugging-port=${this.getRemoteDebuggingPort()}`
    ]
    if (profilePath) {
      args.push(`--user-data-dir=${profilePath}`)
    }

    let child: ChildProcess
    try {
      child = spawn(this.options.executablePath, args, {
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: {
          ...process.env,
          ...(profilePath ? { TIA_BUILT_IN_BROWSER_PROFILE_PATH: profilePath } : {}),
          TIA_BUILT_IN_BROWSER_PARENT_PID: String(process.pid),
          TIA_BUILT_IN_BROWSER_PORT: String(this.getRemoteDebuggingPort()),
          ELECTRON_RUN_AS_NODE: undefined
        }
      })
    } catch (error) {
      this.rejectReady?.(error)
      this.rejectReady = null
      this.resolveReady = null
      throw error
    }

    this.child = child
    logger.info(
      `[BuiltInBrowserManager] launched built-in browser process pid=${child.pid ?? 'unknown'}`
    )

    child.on('message', (message) => {
      this.handleChildMessage(message)
    })
    child.once('error', (error) => {
      logger.error('[BuiltInBrowserManager] browser process failed to start:', error)
      this.rejectReady?.(error)
      this.rejectReady = null
      this.resolveReady = null
    })
    child.once('exit', (code, signal) => {
      logger.info(
        `[BuiltInBrowserManager] browser process exited code=${String(code)} signal=${String(signal)}`
      )
      this.child = null
      this.ready = false
      this.pendingMessages = []
      const exitError = new Error('Built-in browser process exited.')
      this.rejectReady?.(exitError)
      this.rejectReady = null
      this.resolveReady = null

      if (this.pendingHandoff) {
        clearTimeout(this.pendingHandoff.timeoutHandle)
        this.pendingHandoff.reject(exitError)
        this.pendingHandoff = null
      }
    })
  }

  async showWindow(): Promise<void> {
    await this.ensureReady()
    this.send({ type: 'show-window' })
  }

  async hideWindow(): Promise<void> {
    await this.ensureReady()
    this.send({ type: 'hide-window' })
  }

  async requestHumanHandoff(
    input: BrowserHumanHandoffRequest
  ): Promise<BrowserHumanHandoffResult> {
    const message = input.message.trim()
    if (message.length === 0) {
      throw new Error('Human handoff message must not be empty.')
    }

    await this.ensureReady()

    if (this.pendingHandoff) {
      throw new Error('A built-in browser human handoff is already in progress.')
    }

    const requestId = randomUUID()
    const timeoutMs = input.timeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS

    return await new Promise<BrowserHumanHandoffResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (this.pendingHandoff?.requestId !== requestId) {
          return
        }

        this.send({
          type: 'clear-human-handoff',
          requestId
        })
        this.pendingHandoff = null
        resolve({
          status: 'timed_out',
          currentUrl: this.currentUrl,
          remoteDebuggingPort: this.getRemoteDebuggingPort()
        })
      }, timeoutMs)

      this.pendingHandoff = {
        requestId,
        resolve,
        reject,
        timeoutHandle
      }

      this.send({
        type: 'request-human-handoff',
        requestId,
        message,
        buttonLabel: input.buttonLabel?.trim() || 'Done, continue'
      })
    })
  }

  shutdown(): void {
    if (this.pendingHandoff) {
      clearTimeout(this.pendingHandoff.timeoutHandle)
      this.pendingHandoff.reject(new Error('Built-in browser handoff aborted during shutdown.'))
      this.pendingHandoff = null
    }

    if (!this.child || this.child.killed) {
      this.child = null
      this.ready = false
      this.pendingMessages = []
      return
    }

    try {
      this.send({ type: 'quit' })
    } catch {
      // Ignore best-effort IPC shutdown failures and force-kill below.
    }

    killChildProcessTree(this.child)
    this.child = null
    this.ready = false
    this.pendingMessages = []
  }

  private async ensureReady(): Promise<void> {
    await this.launch()

    if (this.ready) {
      return
    }

    if (!this.readyPromise) {
      throw new Error('Built-in browser ready state is unavailable.')
    }

    await Promise.race([
      this.readyPromise,
      new Promise<never>((_, reject) => {
        const timeoutHandle = setTimeout(() => {
          reject(new Error('Timed out waiting for the built-in browser to become ready.'))
        }, DEFAULT_READY_TIMEOUT_MS)

        this.readyPromise
          ?.catch(() => undefined)
          .finally(() => clearTimeout(timeoutHandle))
      })
    ])
  }

  private send(message: BuiltInBrowserControlMessage): void {
    if (!this.child || this.child.killed) {
      throw new Error('Built-in browser process is not running.')
    }

    if (!this.ready && message.type !== 'quit') {
      this.pendingMessages.push(message)
      return
    }

    this.child.send(message)
  }

  private flushPendingMessages(): void {
    if (!this.child || this.child.killed || !this.ready) {
      return
    }

    const queued = [...this.pendingMessages]
    this.pendingMessages = []
    for (const message of queued) {
      this.child.send(message)
    }
  }

  private handleChildMessage(message: unknown): void {
    if (!isEventMessage(message)) {
      return
    }

    if ('currentUrl' in message && typeof message.currentUrl === 'string') {
      this.currentUrl = message.currentUrl
    }

    switch (message.type) {
      case 'ready':
        this.ready = true
        this.resolveReady?.()
        this.resolveReady = null
        this.rejectReady = null
        this.flushPendingMessages()
        return
      case 'window-state':
      case 'human-handoff-opened':
        return
      case 'human-handoff-completed': {
        if (this.pendingHandoff?.requestId !== message.requestId) {
          return
        }

        clearTimeout(this.pendingHandoff.timeoutHandle)
        this.pendingHandoff.resolve({
          status: 'completed',
          currentUrl: message.currentUrl,
          remoteDebuggingPort: this.getRemoteDebuggingPort()
        })
        this.pendingHandoff = null
        return
      }
      case 'error': {
        if (message.code === 'handoff-failed' && this.pendingHandoff) {
          clearTimeout(this.pendingHandoff.timeoutHandle)
          this.pendingHandoff.reject(new Error(message.message))
          this.pendingHandoff = null
        }
      }
    }
  }

  private resolveProfilePath(fresh: boolean): string | null {
    const profileRootPath = this.options.profileRootPath
    if (!profileRootPath) {
      return null
    }

    mkdirSync(profileRootPath, { recursive: true })
    if (fresh || !this.currentProfilePath) {
      this.currentProfilePath = fresh
        ? join(profileRootPath, `recovery-${Date.now()}-${randomUUID()}`)
        : this.readPersistedProfilePath(profileRootPath) ?? join(profileRootPath, 'default')
    }

    mkdirSync(this.currentProfilePath, { recursive: true })
    this.persistProfilePath(profileRootPath, this.currentProfilePath)
    return this.currentProfilePath
  }

  private async prepareLaunch(): Promise<string | null> {
    const remoteDebuggingPort = this.getRemoteDebuggingPort()
    const portHealth = await probeRemoteDebuggingPort(remoteDebuggingPort)

    if (portHealth !== 'absent') {
      const listeningPids = findListeningPidsByPort(remoteDebuggingPort)
      if (listeningPids.length === 0) {
        throw new Error(
          `Built-in browser port ${remoteDebuggingPort} is busy, but the owning process could not be identified.`
        )
      }

      logger.warn(
        `[BuiltInBrowserManager] reclaiming ${portHealth} DevTools listener on port ${remoteDebuggingPort} from pid=${listeningPids.join(',')}`
      )
      for (const pid of listeningPids) {
        killProcessByPid(pid)
      }

      await this.waitForPortToClear(remoteDebuggingPort)
      if (portHealth === 'unhealthy') {
        logger.warn(
          `[BuiltInBrowserManager] rotating built-in browser profile after unhealthy port ${remoteDebuggingPort}`
        )
      }
    }

    return this.resolveProfilePath(portHealth === 'unhealthy')
  }

  private async waitForPortToClear(port: number): Promise<void> {
    const deadline = Date.now() + DEVTOOLS_PORT_RELEASE_TIMEOUT_MS

    while (Date.now() < deadline) {
      if ((await probeRemoteDebuggingPort(port)) === 'absent') {
        return
      }

      await sleep(DEVTOOLS_PORT_RELEASE_POLL_INTERVAL_MS)
    }

    throw new Error(
      `Built-in browser port ${port} remained busy after the stale listener was terminated.`
    )
  }

  private readPersistedProfilePath(profileRootPath: string): string | null {
    const persisted = readJsonFile(join(profileRootPath, ACTIVE_PROFILE_STATE_FILENAME))
    if (!persisted || typeof persisted !== 'object') {
      return null
    }

    if (!('profileId' in persisted) || typeof persisted.profileId !== 'string') {
      return null
    }

    const profileId = persisted.profileId.trim()
    if (profileId.length === 0) {
      return null
    }

    return join(profileRootPath, basename(profileId))
  }

  private persistProfilePath(profileRootPath: string, profilePath: string): void {
    try {
      writeFileSync(
        join(profileRootPath, ACTIVE_PROFILE_STATE_FILENAME),
        JSON.stringify(
          {
            profileId: basename(profilePath)
          },
          null,
          2
        )
      )
    } catch (error) {
      logger.warn('[BuiltInBrowserManager] failed to persist active browser profile:', error)
    }
  }
}

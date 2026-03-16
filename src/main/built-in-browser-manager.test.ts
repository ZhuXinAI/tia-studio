import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuiltInBrowserManager } from './built-in-browser-manager'
import { BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT } from './built-in-browser-contract'

const { fetchMock, spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args)
}))

class FakeChildProcess extends EventEmitter {
  killed = false
  pid = 4242
  readonly sentMessages: unknown[] = []

  send(message: unknown) {
    this.sentMessages.push(message)
  }

  kill() {
    this.killed = true
    this.emit('exit', 0, null)
    return true
  }
}

function createPortAbsentError(): Error {
  const error = new TypeError('fetch failed') as Error & {
    cause?: {
      code?: string
    }
  }
  error.cause = {
    code: 'ECONNREFUSED'
  }
  return error
}

describe('BuiltInBrowserManager', () => {
  const processKillSpy = vi.spyOn(process, 'kill')
  let profileRootPath: string

  beforeEach(() => {
    profileRootPath = mkdtempSync(join(tmpdir(), 'tia-built-in-browser-manager-'))
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    spawnMock.mockReset()
    spawnSyncMock.mockReset()
    processKillSpy.mockReset()
    processKillSpy.mockImplementation(() => true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    rmSync(profileRootPath, { recursive: true, force: true })
  })

  it('launches the built-in browser with the expected entry, remote debugging port, and profile', async () => {
    const child = new FakeChildProcess()
    spawnMock.mockReturnValue(child)
    fetchMock.mockRejectedValue(createPortAbsentError())

    const manager = new BuiltInBrowserManager({
      executablePath: '/Applications/TIA.app/Contents/MacOS/TIA',
      entryPath: '/app/out/main/built-in-browser.js',
      profileRootPath
    })

    await manager.launch()

    expect(spawnMock).toHaveBeenCalledWith(
      '/Applications/TIA.app/Contents/MacOS/TIA',
      [
        '/app/out/main/built-in-browser.js',
        `--remote-debugging-port=${BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT}`,
        `--user-data-dir=${join(profileRootPath, 'default')}`
      ],
      expect.objectContaining({
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: expect.objectContaining({
          TIA_BUILT_IN_BROWSER_PROFILE_PATH: join(profileRootPath, 'default')
        })
      })
    )
  })

  it('kills an unhealthy stale DevTools listener and relaunches with a fresh profile', async () => {
    const child = new FakeChildProcess()
    spawnMock.mockReturnValue(child)
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockRejectedValueOnce(createPortAbsentError())

    if (process.platform === 'win32') {
      spawnSyncMock.mockImplementation((command: string) => {
        if (command === 'netstat') {
          return {
            stdout: `  TCP    127.0.0.1:${BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT}    0.0.0.0:0    LISTENING    777\r\n`
          }
        }

        return { stdout: '' }
      })
    } else {
      spawnSyncMock.mockImplementation((command: string) => {
        if (command === 'lsof') {
          return { stdout: '777\n' }
        }

        return { stdout: '' }
      })
    }

    const manager = new BuiltInBrowserManager({
      executablePath: '/Applications/TIA.app/Contents/MacOS/TIA',
      entryPath: '/app/out/main/built-in-browser.js',
      profileRootPath
    })

    await manager.launch()

    if (process.platform === 'win32') {
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '777', '/t', '/f'],
        expect.objectContaining({
          stdio: 'ignore',
          windowsHide: true
        })
      )
    } else {
      expect(processKillSpy).toHaveBeenCalledWith(777, 'SIGKILL')
    }

    const spawnedArgs = spawnMock.mock.calls[0]?.[1] as string[]
    const userDataDirArg = spawnedArgs.find((arg) => arg.startsWith('--user-data-dir='))
    expect(
      userDataDirArg?.startsWith(`--user-data-dir=${join(profileRootPath, 'recovery-')}`)
    ).toBe(true)
  })

  it('reuses the last active recovery profile after an app restart', async () => {
    const firstChild = new FakeChildProcess()
    const secondChild = new FakeChildProcess()
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild)
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockRejectedValueOnce(createPortAbsentError())
      .mockRejectedValueOnce(createPortAbsentError())

    if (process.platform === 'win32') {
      spawnSyncMock.mockImplementation((command: string) => {
        if (command === 'netstat') {
          return {
            stdout: `  TCP    127.0.0.1:${BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT}    0.0.0.0:0    LISTENING    777\r\n`
          }
        }

        return { stdout: '' }
      })
    } else {
      spawnSyncMock.mockImplementation((command: string) => {
        if (command === 'lsof') {
          return { stdout: '777\n' }
        }

        return { stdout: '' }
      })
    }

    const firstManager = new BuiltInBrowserManager({
      executablePath: '/Applications/TIA.app/Contents/MacOS/TIA',
      entryPath: '/app/out/main/built-in-browser.js',
      profileRootPath
    })

    await firstManager.launch()

    const firstSpawnedArgs = spawnMock.mock.calls[0]?.[1] as string[]
    const firstUserDataDirArg = firstSpawnedArgs.find((arg) => arg.startsWith('--user-data-dir='))
    expect(firstUserDataDirArg).toBeDefined()

    const secondManager = new BuiltInBrowserManager({
      executablePath: '/Applications/TIA.app/Contents/MacOS/TIA',
      entryPath: '/app/out/main/built-in-browser.js',
      profileRootPath
    })

    await secondManager.launch()

    const secondSpawnedArgs = spawnMock.mock.calls[1]?.[1] as string[]
    expect(secondSpawnedArgs).toContain(firstUserDataDirArg)
  })

  it('kills a healthy stale DevTools listener but keeps the active profile', async () => {
    const child = new FakeChildProcess()
    spawnMock.mockReturnValue(child)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'page-1', type: 'page' }]), { status: 200 })
      )
      .mockRejectedValueOnce(createPortAbsentError())

    if (process.platform === 'win32') {
      spawnSyncMock.mockImplementation((command: string) => {
        if (command === 'netstat') {
          return {
            stdout: `  TCP    127.0.0.1:${BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT}    0.0.0.0:0    LISTENING    888\r\n`
          }
        }

        return { stdout: '' }
      })
    } else {
      spawnSyncMock.mockImplementation((command: string) => {
        if (command === 'lsof') {
          return { stdout: '888\n' }
        }

        return { stdout: '' }
      })
    }

    const manager = new BuiltInBrowserManager({
      executablePath: '/Applications/TIA.app/Contents/MacOS/TIA',
      entryPath: '/app/out/main/built-in-browser.js',
      profileRootPath
    })

    await manager.launch()

    const spawnedArgs = spawnMock.mock.calls[0]?.[1] as string[]
    expect(spawnedArgs).toContain(`--user-data-dir=${join(profileRootPath, 'default')}`)
  })

  it('waits for the browser handoff to complete and kills the child on shutdown', async () => {
    const child = new FakeChildProcess()
    spawnMock.mockReturnValue(child)
    fetchMock.mockRejectedValue(createPortAbsentError())

    const manager = new BuiltInBrowserManager({
      executablePath: '/Applications/TIA.app/Contents/MacOS/TIA',
      entryPath: '/app/out/main/built-in-browser.js'
    })

    const handoffPromise = manager.requestHumanHandoff({
      message: 'Please finish logging in.',
      buttonLabel: 'Done, continue',
      timeoutMs: 5_000
    })

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
    })

    child.emit('message', {
      type: 'ready',
      remoteDebuggingPort: BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT,
      visible: false,
      currentUrl: 'about:blank'
    })
    await vi.waitFor(() => {
      expect(child.sentMessages).toHaveLength(1)
    })

    expect(child.sentMessages[0]).toMatchObject({
      type: 'request-human-handoff',
      message: 'Please finish logging in.',
      buttonLabel: 'Done, continue'
    })

    const requestMessage = child.sentMessages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'request-human-handoff'
    ) as { requestId: string }

    child.emit('message', {
      type: 'human-handoff-completed',
      requestId: requestMessage.requestId,
      currentUrl: 'https://example.test/account'
    })

    await expect(handoffPromise).resolves.toEqual({
      status: 'completed',
      currentUrl: 'https://example.test/account',
      remoteDebuggingPort: BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT
    })

    manager.shutdown()

    expect(child.sentMessages.at(-1)).toMatchObject({
      type: 'quit'
    })
    if (process.platform === 'win32') {
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', String(child.pid), '/t', '/f'],
        expect.objectContaining({
          stdio: 'ignore',
          windowsHide: true
        })
      )
    } else {
      expect(processKillSpy).toHaveBeenCalledWith(-child.pid, 'SIGKILL')
    }
  })
})

import { describe, expect, it, vi } from 'vitest'
import { registerSingleInstanceApp } from './single-instance'

function createAppStub(overrides?: {
  hasLock?: boolean
  isReady?: boolean
  whenReady?: Promise<unknown>
}) {
  let secondInstanceListener:
    | ((event: unknown, argv: string[], workingDirectory: string, additionalData: unknown) => void)
    | null = null

  const app = {
    requestSingleInstanceLock: vi.fn(() => overrides?.hasLock ?? true),
    quit: vi.fn(),
    on: vi.fn(
      (
        event: 'second-instance',
        listener: (
          event: unknown,
          argv: string[],
          workingDirectory: string,
          additionalData: unknown
        ) => void
      ) => {
        if (event === 'second-instance') {
          secondInstanceListener = listener
        }
      }
    ),
    isReady: vi.fn(() => overrides?.isReady ?? true),
    whenReady: vi.fn(() => overrides?.whenReady ?? Promise.resolve())
  }

  return {
    app,
    emitSecondInstance: () => {
      secondInstanceListener?.({}, [], '', {})
    }
  }
}

describe('registerSingleInstanceApp', () => {
  it('quits the current process when another instance already owns the lock', () => {
    const { app } = createAppStub({ hasLock: false })
    const onSecondInstance = vi.fn()

    const didRegister = registerSingleInstanceApp({ app, onSecondInstance })

    expect(didRegister).toBe(false)
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(app.on).not.toHaveBeenCalled()
    expect(onSecondInstance).not.toHaveBeenCalled()
  })

  it('registers a second-instance handler when the lock is acquired', () => {
    const { app } = createAppStub()

    const didRegister = registerSingleInstanceApp({
      app,
      onSecondInstance: vi.fn()
    })

    expect(didRegister).toBe(true)
    expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1)
    expect(app.on).toHaveBeenCalledTimes(1)
    expect(app.on).toHaveBeenCalledWith('second-instance', expect.any(Function))
  })

  it('focuses the existing app immediately when a second instance launches after ready', () => {
    const { app, emitSecondInstance } = createAppStub({ isReady: true })
    const onSecondInstance = vi.fn()

    registerSingleInstanceApp({ app, onSecondInstance })
    emitSecondInstance()

    expect(app.whenReady).not.toHaveBeenCalled()
    expect(onSecondInstance).toHaveBeenCalledTimes(1)
  })

  it('waits for readiness before focusing the existing app on second launch', async () => {
    let resolveWhenReady!: () => void
    const whenReady = new Promise<void>((resolve) => {
      resolveWhenReady = resolve
    })
    const { app, emitSecondInstance } = createAppStub({
      isReady: false,
      whenReady
    })
    const onSecondInstance = vi.fn()

    registerSingleInstanceApp({ app, onSecondInstance })
    emitSecondInstance()

    expect(app.whenReady).toHaveBeenCalledTimes(1)
    expect(onSecondInstance).not.toHaveBeenCalled()

    resolveWhenReady()
    await whenReady
    await Promise.resolve()

    expect(onSecondInstance).toHaveBeenCalledTimes(1)
  })
})

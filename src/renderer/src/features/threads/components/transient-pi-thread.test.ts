import { describe, expect, it, vi } from 'vitest'
import { restartTransientSession } from './transient-pi-thread-restart'

describe('restartTransientSession', () => {
  it('disposes the active temporary session before clearing its UI', async () => {
    const order: string[] = []
    const close = vi.fn(async () => {
      order.push('close')
    })
    const clear = vi.fn(() => {
      order.push('clear')
    })

    await restartTransientSession('temporary-1', close, clear)

    expect(close).toHaveBeenCalledWith('temporary-1')
    expect(clear).toHaveBeenCalledOnce()
    expect(order).toEqual(['close', 'clear'])
  })
})

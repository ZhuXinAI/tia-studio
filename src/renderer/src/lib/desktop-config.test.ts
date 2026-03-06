// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('desktop config', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(window, 'tiaDesktop')
  })

  it('returns fallback config when desktop bridge is unavailable', async () => {
    const { getDesktopConfig } = await import('./desktop-config')

    await expect(getDesktopConfig()).resolves.toEqual({
      baseUrl: 'http://127.0.0.1:4769',
      authToken: ''
    })
  })

  it('loads and caches config from desktop bridge when available', async () => {
    const getConfig = vi.fn(async () => ({
      baseUrl: 'http://localhost:3000',
      authToken: 'desktop-token'
    }))

    window.tiaDesktop = {
      getConfig,
      pickDirectory: vi.fn(async () => null)
    }

    const { getDesktopConfig } = await import('./desktop-config')

    await expect(getDesktopConfig()).resolves.toEqual({
      baseUrl: 'http://localhost:3000',
      authToken: 'desktop-token'
    })
    await getDesktopConfig()

    expect(getConfig).toHaveBeenCalledTimes(1)
  })
})

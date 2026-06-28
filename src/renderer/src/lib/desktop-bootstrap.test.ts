// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDesktopBootstrapQueryValue,
  getDesktopBootstrap,
  getDesktopBootstrapSnapshot,
  resetDesktopBootstrapCache
} from './desktop-bootstrap'

describe('desktop bootstrap', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetDesktopBootstrapCache()
  })

  it('loads bootstrap data from the renderer query string and strips it from the url', async () => {
    const queryValue = createDesktopBootstrapQueryValue({
      apiBaseUrl: 'http://127.0.0.1:4888',
      authMode: 'bearer',
      authToken: 'query-token',
      app: {
        name: 'TIA Studio',
        version: '9.9.9',
        platform: 'win32'
      },
      capabilities: {
        autoUpdate: true,
        managedRuntimes: true,
        nativeDirectoryPicker: true,
        runtimeOnboarding: true
      }
    })
    window.history.replaceState({}, '', `/?desktopBootstrap=${queryValue}`)

    await expect(getDesktopBootstrap()).resolves.toEqual({
      apiBaseUrl: 'http://127.0.0.1:4888',
      authMode: 'bearer',
      authToken: 'query-token',
      app: {
        name: 'TIA Studio',
        version: '9.9.9',
        platform: 'win32'
      },
      capabilities: {
        autoUpdate: true,
        managedRuntimes: true,
        nativeDirectoryPicker: true,
        runtimeOnboarding: true
      }
    })
    expect(window.location.search).toBe('')
    expect(getDesktopBootstrapSnapshot().app.platform).toBe('win32')
  })

  it('falls back to the local desktop bootstrap route when no query bootstrap is present', async () => {
    window.history.replaceState({}, '', '/')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          apiBaseUrl: 'http://127.0.0.1:4769',
          authMode: 'none',
          app: {
            name: 'TIA Studio',
            version: '0.3.2',
            platform: 'darwin'
          },
          capabilities: {
            autoUpdate: true,
            managedRuntimes: true,
            nativeDirectoryPicker: true,
            runtimeOnboarding: true
          }
        })
      )
    )

    await expect(getDesktopBootstrap()).resolves.toEqual({
      apiBaseUrl: 'http://127.0.0.1:4769',
      authMode: 'none',
      app: {
        name: 'TIA Studio',
        version: '0.3.2',
        platform: 'darwin'
      },
      capabilities: {
        autoUpdate: true,
        managedRuntimes: true,
        nativeDirectoryPicker: true,
        runtimeOnboarding: true
      }
    })
  })
})

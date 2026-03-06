import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerWebSearchSettingsRoute } from './web-search-settings-route'

describe('web search settings route', () => {
  it('returns the configured default engine', async () => {
    const getDefaultEngine = vi.fn(async () => 'bing')
    const setDefaultEngine = vi.fn(async () => 'bing')
    const getKeepBrowserWindowOpen = vi.fn(async () => true)
    const setKeepBrowserWindowOpen = vi.fn(async () => true)
    const getShowBrowser = vi.fn(async () => false)
    const setShowBrowser = vi.fn(async () => false)
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: {
        getDefaultEngine,
        setDefaultEngine,
        getKeepBrowserWindowOpen,
        setKeepBrowserWindowOpen,
        getShowBrowser,
        setShowBrowser
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      defaultEngine: 'bing',
      keepBrowserWindowOpen: true,
      showBrowser: false,
      availableEngines: ['google', 'bing', 'baidu']
    })
    expect(getDefaultEngine).toHaveBeenCalledTimes(1)
    expect(setDefaultEngine).not.toHaveBeenCalled()
    expect(getKeepBrowserWindowOpen).toHaveBeenCalledTimes(1)
    expect(setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(getShowBrowser).toHaveBeenCalledTimes(1)
    expect(setShowBrowser).not.toHaveBeenCalled()
  })

  it('updates default engine with validated payload', async () => {
    const getDefaultEngine = vi.fn(async () => 'bing')
    const setDefaultEngine = vi.fn(async () => 'google')
    const getKeepBrowserWindowOpen = vi.fn(async () => true)
    const setKeepBrowserWindowOpen = vi.fn(async () => true)
    const getShowBrowser = vi.fn(async () => false)
    const setShowBrowser = vi.fn(async () => false)
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: {
        getDefaultEngine,
        setDefaultEngine,
        getKeepBrowserWindowOpen,
        setKeepBrowserWindowOpen,
        getShowBrowser,
        setShowBrowser
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultEngine: 'google' })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      defaultEngine: 'google',
      keepBrowserWindowOpen: true,
      showBrowser: false,
      availableEngines: ['google', 'bing', 'baidu']
    })
    expect(setDefaultEngine).toHaveBeenCalledWith('google')
    expect(getKeepBrowserWindowOpen).toHaveBeenCalledTimes(1)
    expect(setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(getShowBrowser).toHaveBeenCalledTimes(1)
    expect(setShowBrowser).not.toHaveBeenCalled()
  })

  it('updates keepBrowserWindowOpen with validated payload', async () => {
    const getDefaultEngine = vi.fn(async () => 'bing')
    const setDefaultEngine = vi.fn(async () => 'bing')
    const getKeepBrowserWindowOpen = vi.fn(async () => true)
    const setKeepBrowserWindowOpen = vi.fn(async () => false)
    const getShowBrowser = vi.fn(async () => false)
    const setShowBrowser = vi.fn(async () => false)
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: {
        getDefaultEngine,
        setDefaultEngine,
        getKeepBrowserWindowOpen,
        setKeepBrowserWindowOpen,
        getShowBrowser,
        setShowBrowser
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepBrowserWindowOpen: false })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      defaultEngine: 'bing',
      keepBrowserWindowOpen: false,
      showBrowser: false,
      availableEngines: ['google', 'bing', 'baidu']
    })
    expect(setKeepBrowserWindowOpen).toHaveBeenCalledWith(false)
    expect(setDefaultEngine).not.toHaveBeenCalled()
    expect(getShowBrowser).toHaveBeenCalledTimes(1)
    expect(setShowBrowser).not.toHaveBeenCalled()
  })

  it('rejects unsupported search engines', async () => {
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        setDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => true),
        setKeepBrowserWindowOpen: vi.fn(async () => true),
        getShowBrowser: vi.fn(async () => false),
        setShowBrowser: vi.fn(async () => false)
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultEngine: 'duckduckgo' })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false
    })
  })

  it('rejects empty patch payloads', async () => {
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        setDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => true),
        setKeepBrowserWindowOpen: vi.fn(async () => true),
        getShowBrowser: vi.fn(async () => false),
        setShowBrowser: vi.fn(async () => false)
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'At least one web search setting must be provided'
    })
  })

  it('updates showBrowser with validated payload', async () => {
    const getDefaultEngine = vi.fn(async () => 'bing')
    const setDefaultEngine = vi.fn(async () => 'bing')
    const getKeepBrowserWindowOpen = vi.fn(async () => true)
    const setKeepBrowserWindowOpen = vi.fn(async () => true)
    const getShowBrowser = vi.fn(async () => false)
    const setShowBrowser = vi.fn(async () => true)
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: {
        getDefaultEngine,
        setDefaultEngine,
        getKeepBrowserWindowOpen,
        setKeepBrowserWindowOpen,
        getShowBrowser,
        setShowBrowser
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showBrowser: true })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      defaultEngine: 'bing',
      keepBrowserWindowOpen: true,
      showBrowser: true,
      availableEngines: ['google', 'bing', 'baidu']
    })
    expect(setShowBrowser).toHaveBeenCalledWith(true)
    expect(setDefaultEngine).not.toHaveBeenCalled()
    expect(setKeepBrowserWindowOpen).not.toHaveBeenCalled()
  })
})

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerWebSearchSettingsRoute } from './web-search-settings-route'

function createWebSearchSettingsRepo(overrides?: Record<string, unknown>) {
  return {
    getKeepBrowserWindowOpen: vi.fn(async () => true),
    setKeepBrowserWindowOpen: vi.fn(async () => true),
    getShowBrowser: vi.fn(async () => false),
    setShowBrowser: vi.fn(async () => false),
    getShowBuiltInBrowser: vi.fn(async () => false),
    setShowBuiltInBrowser: vi.fn(async () => false),
    getShowTiaBrowserTool: vi.fn(async () => false),
    setShowTiaBrowserTool: vi.fn(async () => false),
    getBrowserAutomationMode: vi.fn(async () => 'built-in-browser'),
    setBrowserAutomationMode: vi.fn(async () => 'built-in-browser'),
    ...overrides
  }
}

describe('web search settings route', () => {
  it('returns the configured browsing settings', async () => {
    const webSearchSettingsRepo = createWebSearchSettingsRepo()
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: webSearchSettingsRepo as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keepBrowserWindowOpen: true,
      showBrowser: false,
      showBuiltInBrowser: false,
      showTiaBrowserTool: false,
      browserAutomationMode: 'built-in-browser'
    })
    expect(webSearchSettingsRepo.getKeepBrowserWindowOpen).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowBuiltInBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBuiltInBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowTiaBrowserTool).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowTiaBrowserTool).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getBrowserAutomationMode).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setBrowserAutomationMode).not.toHaveBeenCalled()
  })

  it('updates keepBrowserWindowOpen with validated payload', async () => {
    const webSearchSettingsRepo = createWebSearchSettingsRepo({
      setKeepBrowserWindowOpen: vi.fn(async () => false)
    })
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: webSearchSettingsRepo as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepBrowserWindowOpen: false })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keepBrowserWindowOpen: false,
      showBrowser: false,
      showBuiltInBrowser: false,
      showTiaBrowserTool: false,
      browserAutomationMode: 'built-in-browser'
    })
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).toHaveBeenCalledWith(false)
    expect(webSearchSettingsRepo.getShowBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowBuiltInBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBuiltInBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowTiaBrowserTool).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowTiaBrowserTool).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getBrowserAutomationMode).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setBrowserAutomationMode).not.toHaveBeenCalled()
  })

  it('rejects empty patch payloads', async () => {
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: createWebSearchSettingsRepo() as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'At least one browsing setting must be provided'
    })
  })

  it('updates showBrowser with validated payload', async () => {
    const webSearchSettingsRepo = createWebSearchSettingsRepo({
      setShowBrowser: vi.fn(async () => true)
    })
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: webSearchSettingsRepo as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showBrowser: true })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keepBrowserWindowOpen: true,
      showBrowser: true,
      showBuiltInBrowser: false,
      showTiaBrowserTool: false,
      browserAutomationMode: 'built-in-browser'
    })
    expect(webSearchSettingsRepo.setShowBrowser).toHaveBeenCalledWith(true)
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowBuiltInBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBuiltInBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowTiaBrowserTool).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowTiaBrowserTool).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getBrowserAutomationMode).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setBrowserAutomationMode).not.toHaveBeenCalled()
  })

  it('updates showBuiltInBrowser and applies the live visibility callback', async () => {
    const webSearchSettingsRepo = createWebSearchSettingsRepo({
      setShowBuiltInBrowser: vi.fn(async () => true)
    })
    const onShowBuiltInBrowserChange = vi.fn(async () => undefined)
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: webSearchSettingsRepo as never,
      onShowBuiltInBrowserChange
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showBuiltInBrowser: true })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keepBrowserWindowOpen: true,
      showBrowser: false,
      showBuiltInBrowser: true,
      showTiaBrowserTool: false,
      browserAutomationMode: 'built-in-browser'
    })
    expect(webSearchSettingsRepo.setShowBuiltInBrowser).toHaveBeenCalledWith(true)
    expect(onShowBuiltInBrowserChange).toHaveBeenCalledWith(true)
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowTiaBrowserTool).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowTiaBrowserTool).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getBrowserAutomationMode).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setBrowserAutomationMode).not.toHaveBeenCalled()
  })

  it('updates showTiaBrowserTool and applies the live visibility callback', async () => {
    const webSearchSettingsRepo = createWebSearchSettingsRepo({
      setShowTiaBrowserTool: vi.fn(async () => true)
    })
    const onShowTiaBrowserToolChange = vi.fn(async () => undefined)
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: webSearchSettingsRepo as never,
      onShowTiaBrowserToolChange
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showTiaBrowserTool: true })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keepBrowserWindowOpen: true,
      showBrowser: false,
      showBuiltInBrowser: false,
      showTiaBrowserTool: true,
      browserAutomationMode: 'built-in-browser'
    })
    expect(webSearchSettingsRepo.setShowTiaBrowserTool).toHaveBeenCalledWith(true)
    expect(onShowTiaBrowserToolChange).toHaveBeenCalledWith(true)
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.setShowBuiltInBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getBrowserAutomationMode).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setBrowserAutomationMode).not.toHaveBeenCalled()
  })

  it('updates browserAutomationMode with validated payload', async () => {
    const webSearchSettingsRepo = createWebSearchSettingsRepo({
      setBrowserAutomationMode: vi.fn(async () => 'tia-browser-tool')
    })
    const app = new Hono()

    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: webSearchSettingsRepo as never
    })

    const response = await app.request('http://localhost/v1/settings/web-search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserAutomationMode: 'tia-browser-tool' })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keepBrowserWindowOpen: true,
      showBrowser: false,
      showBuiltInBrowser: false,
      showTiaBrowserTool: false,
      browserAutomationMode: 'tia-browser-tool'
    })
    expect(webSearchSettingsRepo.setBrowserAutomationMode).toHaveBeenCalledWith('tia-browser-tool')
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.setShowBuiltInBrowser).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowTiaBrowserTool).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowTiaBrowserTool).not.toHaveBeenCalled()
  })
})

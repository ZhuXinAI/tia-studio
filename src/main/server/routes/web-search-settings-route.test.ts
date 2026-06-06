import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerWebSearchSettingsRoute } from './web-search-settings-route'

function createWebSearchSettingsRepo(overrides?: Record<string, unknown>) {
  return {
    getKeepBrowserWindowOpen: vi.fn(async () => true),
    setKeepBrowserWindowOpen: vi.fn(async () => true),
    getShowBrowser: vi.fn(async () => false),
    setShowBrowser: vi.fn(async () => false),
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
      showBrowser: false
    })
    expect(webSearchSettingsRepo.getKeepBrowserWindowOpen).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
    expect(webSearchSettingsRepo.getShowBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
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
      showBrowser: false
    })
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).toHaveBeenCalledWith(false)
    expect(webSearchSettingsRepo.getShowBrowser).toHaveBeenCalledTimes(1)
    expect(webSearchSettingsRepo.setShowBrowser).not.toHaveBeenCalled()
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
      showBrowser: true
    })
    expect(webSearchSettingsRepo.setShowBrowser).toHaveBeenCalledWith(true)
    expect(webSearchSettingsRepo.setKeepBrowserWindowOpen).not.toHaveBeenCalled()
  })
})

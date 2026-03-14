import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerBuiltInBrowserRoute } from './built-in-browser-route'

describe('built-in browser route', () => {
  it('shows the built-in browser window when control is available', async () => {
    const onShowBuiltInBrowserWindow = vi.fn(async () => undefined)
    const app = new Hono()

    registerBuiltInBrowserRoute(app, {
      onShowBuiltInBrowserWindow
    })

    const response = await app.request('http://localhost/v1/built-in-browser/show', {
      method: 'POST'
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true
    })
    expect(onShowBuiltInBrowserWindow).toHaveBeenCalledTimes(1)
  })

  it('returns 503 when built-in browser control is unavailable', async () => {
    const app = new Hono()

    registerBuiltInBrowserRoute(app, {})

    const response = await app.request('http://localhost/v1/built-in-browser/show', {
      method: 'POST'
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Built-in browser window control is unavailable'
    })
  })
})

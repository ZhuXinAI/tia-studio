import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { registerHealthRoute } from './health-route'

describe('health route', () => {
  it('returns a non-sensitive runtime snapshot', async () => {
    const app = new Hono()
    registerHealthRoute(app)

    const response = await app.request('http://localhost/v1/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: 'ok', platform: process.platform })
    expect(body).toHaveProperty('checkedAt')
    expect(body).toHaveProperty('memory.rssBytes')
    expect(JSON.stringify(body)).not.toContain('api_key')
  })

  it('includes dependency signals without exposing dependency configuration', async () => {
    const app = new Hono()
    registerHealthRoute(app, {
      getDependencies: async () => ({
        providers: { state: 'configured', configuredCount: 1, healthyCount: 0, errorCount: 0 },
        mcp: { state: 'healthy', configuredCount: 2, healthyCount: 2, errorCount: 0 },
        channels: { state: 'degraded', configuredCount: 1, healthyCount: 0, errorCount: 1 }
      })
    })

    const response = await app.request('http://localhost/v1/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dependencies).toEqual({
      providers: { state: 'configured', configuredCount: 1, healthyCount: 0, errorCount: 0 },
      mcp: { state: 'healthy', configuredCount: 2, healthyCount: 2, errorCount: 0 },
      channels: { state: 'degraded', configuredCount: 1, healthyCount: 0, errorCount: 1 }
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

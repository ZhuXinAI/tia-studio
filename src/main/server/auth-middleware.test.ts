import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createBearerAuthMiddleware } from './auth-middleware'

describe('createBearerAuthMiddleware', () => {
  it('returns 401 without bearer token', async () => {
    const app = new Hono()
    app.use('/v1/*', createBearerAuthMiddleware('secret-token'))
    app.get('/v1/ping', (context) => context.json({ ok: true }))

    const response = await app.request('http://localhost/v1/ping')
    expect(response.status).toBe(401)
  })

  it('allows request with valid bearer token', async () => {
    const app = new Hono()
    app.use('/v1/*', createBearerAuthMiddleware('secret-token'))
    app.get('/v1/ping', (context) => context.json({ ok: true }))

    const response = await app.request('http://localhost/v1/ping', {
      headers: {
        Authorization: 'Bearer secret-token'
      }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})

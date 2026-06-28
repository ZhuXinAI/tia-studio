import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createBearerAuthMiddleware, createBearerAuthMiddlewareWithOptions } from './auth-middleware'

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

  it('allows annotation-mode requests from configured dev origins without bearer auth', async () => {
    const app = new Hono()
    app.use(
      '/v1/*',
      createBearerAuthMiddlewareWithOptions('secret-token', {
        allowUnauthenticatedOrigins: ['http://localhost:5173']
      })
    )
    app.get('/v1/ping', (context) => context.json({ ok: true }))

    const response = await app.request('http://localhost/v1/ping', {
      headers: {
        Origin: 'http://localhost:5173'
      }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('keeps rejecting requests from non-allowed origins without bearer auth', async () => {
    const app = new Hono()
    app.use(
      '/v1/*',
      createBearerAuthMiddlewareWithOptions('secret-token', {
        allowUnauthenticatedOrigins: ['http://localhost:5173']
      })
    )
    app.get('/v1/ping', (context) => context.json({ ok: true }))

    const response = await app.request('http://localhost/v1/ping', {
      headers: {
        Origin: 'http://example.com'
      }
    })

    expect(response.status).toBe(401)
  })
})

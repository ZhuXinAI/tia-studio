import { describe, expect, it } from 'vitest'
import { createApp } from './create-app'

describe('health route', () => {
  it('returns 200 from /v1/health when authorized', async () => {
    const app = createApp({
      token: 'test-token'
    })

    const response = await app.request('http://localhost/v1/health', {
      headers: {
        Authorization: 'Bearer test-token'
      }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('responds to CORS preflight for renderer origin', async () => {
    const app = createApp({
      token: 'test-token'
    })

    const response = await app.request('http://localhost/v1/assistants', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type'
      }
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })
})

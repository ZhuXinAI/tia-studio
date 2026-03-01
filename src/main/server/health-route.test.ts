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
})

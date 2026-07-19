import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerDesktopRoute } from './desktop-route'

describe('desktop skill marketplace route', () => {
  it('returns an actionable install error instead of an internal server error', async () => {
    const app = new Hono()
    registerDesktopRoute(app, {
      installMarketplaceSkill: vi.fn(async () => {
        throw new Error('Git executable was not found')
      })
    } as never)

    const response = await app.request('http://localhost/v1/desktop/skill-marketplace/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'vercel-labs/skills/find-skills' })
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Skill installation failed: Git executable was not found'
    })
  })
})

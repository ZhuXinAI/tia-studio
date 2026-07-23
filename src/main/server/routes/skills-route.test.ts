import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../create-app'

describe('top skills route', () => {
  it('serves the top catalog through the authenticated API endpoint', async () => {
    const listTopSkills = vi.fn(async () => [
      {
        id: 'example-org/skill-library/design-review',
        rank: 1,
        slug: 'design-review',
        name: 'Design Review',
        source: 'example-org/skill-library',
        installs: 42,
        installedGlobal: false
      }
    ])
    const app = createApp({
      token: 'secret-token',
      desktop: { listSkillMarketplace: listTopSkills } as never
    })

    const unauthorized = await app.request('http://localhost/api/skills/top')
    expect(unauthorized.status).toBe(401)

    const response = await app.request('http://localhost/api/skills/top', {
      headers: { Authorization: 'Bearer secret-token' }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      skills: [
        {
          id: 'example-org/skill-library/design-review',
          rank: 1,
          slug: 'design-review',
          name: 'Design Review',
          source: 'example-org/skill-library',
          installs: 42,
          installedGlobal: false
        }
      ],
      total: 1
    })
    expect(listTopSkills).toHaveBeenCalledOnce()
  })
})

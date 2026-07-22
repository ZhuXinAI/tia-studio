import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerWorkspacesRoute } from './workspaces-route'

describe('workspace composer mentions route', () => {
  it('uses the resolved workspace path for file and skill mentions', async () => {
    const getComposerMentions = vi.fn(async () => ({
      files: [{ relativePath: 'src/main.ts', name: 'main.ts' }],
      skills: [
        {
          id: 'global-codex:frontend-design',
          name: 'Frontend Design',
          description: 'Design frontend interfaces.',
          source: 'global-codex',
          relativePath: 'frontend-design'
        }
      ]
    }))
    const app = new Hono()
    registerWorkspacesRoute(app, {
      workspacesRepo: {
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          rootPath: '/workspace',
          isMissing: false
        }))
      } as never,
      getComposerMentions
    })

    const response = await app.request(
      'http://localhost/v1/workspaces/workspace-1/composer-mentions'
    )

    expect(response.status).toBe(200)
    expect(getComposerMentions).toHaveBeenCalledWith('/workspace')
    await expect(response.json()).resolves.toEqual({
      files: [{ relativePath: 'src/main.ts', name: 'main.ts' }],
      skills: [
        {
          id: 'global-codex:frontend-design',
          name: 'Frontend Design',
          description: 'Design frontend interfaces.',
          source: 'global-codex',
          relativePath: 'frontend-design'
        }
      ]
    })
  })
})

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

describe('workspace administration route', () => {
  it('requires an absolute root path and normalizes it before creation', async () => {
    const create = vi.fn(async (input: { name: string; rootPath: string }) => ({
      id: 'workspace-1',
      ...input,
      builtInKind: null,
      isMissing: false
    }))
    const app = new Hono()
    registerWorkspacesRoute(app, {
      workspacesRepo: {
        create,
        getById: vi.fn(),
        list: vi.fn()
      } as never
    })

    const relativeResponse = await app.request('http://localhost/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Project', rootPath: 'relative/project' })
    })
    const validResponse = await app.request('http://localhost/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Project', rootPath: '/tmp/project/../project' })
    })

    expect(relativeResponse.status).toBe(400)
    expect(validResponse.status).toBe(201)
    expect(create).toHaveBeenCalledWith({ name: 'Project', rootPath: '/tmp/project' })
  })

  it('returns a conflict when a workspace root path is already in use', async () => {
    const app = new Hono()
    registerWorkspacesRoute(app, {
      workspacesRepo: {
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          name: 'Project',
          rootPath: '/tmp/project',
          builtInKind: null,
          isMissing: false
        })),
        update: vi.fn(async () => {
          throw new Error('A workspace already uses this root path')
        })
      } as never
    })

    const response = await app.request('http://localhost/v1/workspaces/workspace-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPath: '/tmp/other' })
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'A workspace already uses this root path'
    })
  })
})

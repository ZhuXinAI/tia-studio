import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerWorkspaceFilesRoute } from './workspace-files-route'
import { WorkspaceFileError } from '../../workspaces/workspace-file-service'

describe('workspace files route', () => {
  it('resolves the session workspace instead of accepting a renderer path', async () => {
    const listDirectory = vi.fn(async (_workspacePath: string, relativePath: string) => ({
      relativePath,
      truncated: false,
      entries: [{ name: 'main.ts', relativePath: 'main.ts', kind: 'file' as const }]
    }))
    const app = new Hono()
    registerWorkspaceFilesRoute(app, {
      runtime: {
        getSession: vi.fn(async () => ({ id: 'session-1', workspacePath: '/safe/workspace' }))
      } as never,
      files: { listDirectory } as never
    })

    const response = await app.request(
      'http://localhost/v1/agent/sessions/session-1/files?path=src'
    )

    expect(response.status).toBe(200)
    expect(listDirectory).toHaveBeenCalledWith('/safe/workspace', 'src')
    await expect(response.json()).resolves.toMatchObject({ relativePath: 'src' })
  })

  it('returns a conflict when a file changed before save', async () => {
    const app = new Hono()
    const writeFile = vi.fn(async () => {
      throw new WorkspaceFileError('conflict', 'changed')
    })
    registerWorkspaceFilesRoute(app, {
      runtime: {
        getSession: vi.fn(async () => ({ id: 'session-1', workspacePath: '/safe/workspace' }))
      } as never,
      files: { writeFile } as never
    })

    const response = await app.request(
      'http://localhost/v1/agent/sessions/session-1/files/content',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'main.ts', content: 'next', expectedSha256: 'a'.repeat(64) })
      }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'changed' })
  })
})

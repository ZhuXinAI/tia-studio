import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerMemoriesRoute } from './memories-route'

describe('memories route', () => {
  it('validates and forwards memory CRUD operations', async () => {
    const repo = {
      list: vi.fn(async () => []),
      create: vi.fn(async (input) => ({ id: 'memory-1', ...input })),
      update: vi.fn(async (id, input) => ({ id, ...input })),
      delete: vi.fn(async () => true)
    }
    const app = new Hono()
    registerMemoriesRoute(app, { memoriesRepo: repo as never })

    const invalid = await app.request('http://localhost/v1/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', content: '', workspaceId: null, enabled: true })
    })
    expect(invalid.status).toBe(400)

    const created = await app.request('http://localhost/v1/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Preference',
        content: 'Use short answers.',
        workspaceId: null,
        enabled: true
      })
    })
    expect(created.status).toBe(201)
    expect(repo.create).toHaveBeenCalledWith({
      title: 'Preference',
      content: 'Use short answers.',
      workspaceId: null,
      enabled: true
    })

    const list = await app.request('http://localhost/v1/memories?workspaceId=workspace-1')
    expect(list.status).toBe(200)
    expect(repo.list).toHaveBeenCalledWith('workspace-1')

    const removed = await app.request('http://localhost/v1/memories/memory-1', { method: 'DELETE' })
    expect(removed.status).toBe(204)
  })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createThread, deleteThread, listThreads } from './threads-query'

describe('threads query api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('lists threads by workspace id', async () => {
    const responseBody = [
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'profile-default',
        title: 'Sprint',
        lastMessageAt: null,
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ]
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const threads = await listThreads({ workspaceId: 'workspace-chats' })

    expect(threads).toEqual(responseBody)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/threads?workspaceId=workspace-chats',
      expect.objectContaining({
        method: 'GET'
      })
    )
  })

  it('lists threads by assistant id when requested', async () => {
    const responseBody = [
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'profile-default',
        title: 'Sprint',
        lastMessageAt: null,
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ]
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const threads = await listThreads({ assistantId: 'assistant-1' })

    expect(threads).toEqual(responseBody)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/threads?assistantId=assistant-1',
      expect.objectContaining({
        method: 'GET'
      })
    )
  })

  it('creates and deletes a thread', async () => {
    const created = {
      id: 'thread-1',
      assistantId: 'assistant-1',
      resourceId: 'profile-default',
      title: 'Sprint',
      lastMessageAt: null,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204
        })
      )
    vi.stubGlobal('fetch', fetchSpy)

    const createdThread = await createThread({
      assistantId: 'assistant-1',
      resourceId: 'profile-default',
      title: 'Sprint'
    })
    await deleteThread(createdThread.id)

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:4769/v1/threads',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4769/v1/threads/thread-1',
      expect.objectContaining({
        method: 'DELETE'
      })
    )
  })

  it('includes hidden threads when explicitly requested', async () => {
    const responseBody = [
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'profile-default',
        title: 'Background task',
        metadata: {
          system: true,
          systemType: 'background',
          taskId: 'task-1'
        },
        lastMessageAt: null,
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ]
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const threads = await listThreads({ assistantId: 'assistant-1', includeHidden: true })

    expect(threads).toEqual(responseBody)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/threads?assistantId=assistant-1&includeHidden=true',
      expect.objectContaining({
        method: 'GET'
      })
    )
  })

  it('keeps hidden system threads out of normal thread navigation requests by default', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    await listThreads({ assistantId: 'assistant-1' })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/threads?assistantId=assistant-1',
      expect.objectContaining({
        method: 'GET'
      })
    )
  })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from 'ai'
import {
  createTeamWorkspace,
  deleteTeamWorkspace,
  listTeamWorkspaces,
  listTeamWorkspaceMembers,
  replaceTeamWorkspaceMembers,
  updateTeamWorkspace
} from './team-workspaces-query'
import {
  createTeamThread,
  deleteTeamThread,
  listTeamThreadMembers,
  listTeamThreads,
  replaceTeamThreadMembers,
  updateTeamThread
} from './team-threads-query'
import {
  createTeamChatFetch,
  createTeamChatTransport,
  listTeamThreadMessages
} from './team-chat-query'
import { openTeamStatusStream, type TeamStatusEvent } from './team-status-stream'

function createWorkspaceRecord(id: string) {
  return {
    id,
    name: 'Docs Workspace',
    rootPath: '/Users/demo/project',
    teamDescription: 'Coordinate docs release',
    supervisorProviderId: 'provider-1',
    supervisorModel: 'gpt-5',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z'
  }
}

function createThreadRecord(id: string) {
  return {
    id,
    workspaceId: 'workspace-1',
    resourceId: 'default-profile',
    title: '',
    teamDescription: 'Coordinate the release checklist.',
    supervisorProviderId: 'provider-1',
    supervisorModel: 'gpt-5',
    lastMessageAt: null,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z'
  }
}

describe('team renderer data layer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'team-token'
      })),
      pickDirectory: vi.fn(async () => null)
    }
  })

  it('calls the team workspace and thread endpoints', async () => {
    const workspaceRecord = createWorkspaceRecord('workspace-1')
    const threadRecord = createThreadRecord('thread-1')
    const updatedThreadRecord = {
      ...threadRecord,
      title: 'Release Team'
    }
    const workspaceMembers = [
      {
        workspaceId: 'workspace-1',
        assistantId: 'assistant-2',
        sortOrder: 0,
        createdAt: '2026-03-07T00:00:00.000Z'
      }
    ]
    const members = [
      {
        teamThreadId: 'thread-1',
        assistantId: 'assistant-2',
        sortOrder: 0,
        createdAt: '2026-03-07T00:00:00.000Z'
      }
    ]
    const chatMessages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello team' }]
      }
    ]

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([workspaceRecord]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(workspaceRecord), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(workspaceRecord), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(workspaceMembers), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(workspaceMembers), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([threadRecord]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(threadRecord), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(updatedThreadRecord), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(members), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(members), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(chatMessages), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(listTeamWorkspaces()).resolves.toEqual([workspaceRecord])
    await expect(
      createTeamWorkspace({
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project'
      })
    ).resolves.toEqual(workspaceRecord)
    await expect(
      updateTeamWorkspace('workspace-1', {
        teamDescription: 'Coordinate docs release',
        supervisorProviderId: 'provider-1',
        supervisorModel: 'gpt-5'
      })
    ).resolves.toEqual(workspaceRecord)
    await expect(listTeamWorkspaceMembers('workspace-1')).resolves.toEqual(workspaceMembers)
    await expect(replaceTeamWorkspaceMembers('workspace-1', ['assistant-2'])).resolves.toEqual(
      workspaceMembers
    )
    await deleteTeamWorkspace('workspace-1')

    await expect(listTeamThreads('workspace-1')).resolves.toEqual([threadRecord])
    await expect(
      createTeamThread({
        workspaceId: 'workspace-1',
        resourceId: 'default-profile'
      })
    ).resolves.toEqual(threadRecord)
    await expect(
      updateTeamThread('thread-1', {
        title: 'Release Team'
      })
    ).resolves.toEqual(updatedThreadRecord)
    await expect(listTeamThreadMembers('thread-1')).resolves.toEqual(members)
    await expect(replaceTeamThreadMembers('thread-1', ['assistant-2'])).resolves.toEqual(members)
    await deleteTeamThread('thread-1')
    await expect(
      listTeamThreadMessages({
        threadId: 'thread-1',
        profileId: 'default-profile'
      })
    ).resolves.toEqual(chatMessages)

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:4769/v1/team/workspaces',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:4769/v1/team/workspaces/workspace-1/members',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      7,
      'http://127.0.0.1:4769/v1/team/threads?workspaceId=workspace-1',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      10,
      'http://127.0.0.1:4769/v1/team/threads/thread-1/members',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      13,
      'http://127.0.0.1:4769/team-chat/thread-1/history?profileId=default-profile',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('normalizes sparse team workspace payloads from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: 'workspace-1',
              name: 'Docs Workspace',
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      )
    )

    await expect(listTeamWorkspaces()).resolves.toEqual([
      {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }
    ])
  })

  it('creates a team chat transport for the team endpoint and captures the run id header', async () => {
    const onRunStarted = vi.fn()
    const fetchSpy = vi.fn(async () =>
      new Response('ok', {
        status: 200,
        headers: {
          'x-team-run-id': 'run-1'
        }
      })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const transport = createTeamChatTransport({
      threadId: 'thread-1',
      profileId: 'default-profile',
      onRunStarted
    })

    expect((transport as unknown as { api: string }).api).toBe('/team-chat/thread-1')

    const teamFetch = createTeamChatFetch({ onRunStarted })
    await teamFetch('/team-chat/thread-1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: []
      })
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/team-chat/thread-1',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(onRunStarted).toHaveBeenCalledWith('run-1')
  })

  it('opens the team status stream with authorization headers', async () => {
    const event: TeamStatusEvent = {
      type: 'run-started',
      runId: 'run-1',
      threadId: 'thread-1',
      createdAt: '2026-03-07T00:00:00.000Z'
    }
    const encoder = new TextEncoder()
    const fetchSpy = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            controller.close()
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
        }
      )
    )
    vi.stubGlobal('fetch', fetchSpy)
    const eventSourceSpy = vi.fn()
    vi.stubGlobal('EventSource', eventSourceSpy as unknown as typeof EventSource)

    const onEvent = vi.fn()
    const handle = openTeamStatusStream({
      threadId: 'thread-1',
      runId: 'run-1',
      onEvent
    })

    await handle.done

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/team-chat/thread-1/runs/run-1/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer team-token'
        })
      })
    )
    expect(onEvent).toHaveBeenCalledWith(event)
    expect(eventSourceSpy).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGroup,
  listGroupMembers,
  listGroups,
  replaceGroupMembers,
  updateGroup
} from './group-groups-query'
import {
  createGroupThread,
  deleteGroupThread,
  listGroupThreads,
  updateGroupThread
} from './group-threads-query'
import {
  listGroupThreadMessages,
  submitGroupWatcherMessage,
  type GroupRoomMessageRecord
} from './group-chat-query'
import { openGroupStatusStream, type GroupStatusEvent } from './group-status-stream'
import {
  openGroupThreadEventsStream,
  type GroupThreadEvent
} from './group-thread-events-stream'

function createGroupRecord(id: string) {
  return {
    id,
    name: 'Launch Group',
    rootPath: '',
    groupDescription: 'Plan the launch.',
    maxAutoTurns: 6,
    createdAt: '2026-03-13T00:00:00.000Z',
    updatedAt: '2026-03-13T00:00:00.000Z'
  }
}

function createThreadRecord(id: string) {
  return {
    id,
    groupId: 'group-1',
    resourceId: 'default-profile',
    title: '',
    lastMessageAt: null,
    createdAt: '2026-03-13T00:00:00.000Z',
    updatedAt: '2026-03-13T00:00:00.000Z'
  }
}

describe('group renderer data layer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'group-token'
      })),
      pickDirectory: vi.fn(async () => null)
    }
  })

  it('calls the group workspace, thread, history, submit, and status endpoints', async () => {
    const groupRecord = createGroupRecord('group-1')
    const threadRecord = createThreadRecord('thread-1')
    const updatedThreadRecord = {
      ...threadRecord,
      title: 'Launch Room'
    }
    const groupMembers = [
      {
        groupId: 'group-1',
        assistantId: 'assistant-1',
        sortOrder: 0,
        createdAt: '2026-03-13T00:00:00.000Z'
      }
    ]
    const roomMessages: GroupRoomMessageRecord[] = [
      {
        id: 'msg-1',
        threadId: 'thread-1',
        role: 'assistant',
        authorType: 'assistant',
        authorId: 'assistant-1',
        authorName: 'Planner',
        content: 'I can outline the rollout.',
        mentions: [],
        createdAt: '2026-03-13T00:00:00.000Z'
      }
    ]

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([groupRecord]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(groupRecord), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(groupRecord), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(groupMembers), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(groupMembers), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
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
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(roomMessages), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ runId: 'run-1', messageId: 'msg-2' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(listGroups()).resolves.toEqual([groupRecord])
    await expect(
      createGroup({
        name: 'Launch Group',
        assistantIds: ['assistant-1']
      })
    ).resolves.toEqual(groupRecord)
    await expect(
      updateGroup('group-1', {
        groupDescription: 'Plan the launch.',
        maxAutoTurns: 6
      })
    ).resolves.toEqual(groupRecord)
    await expect(listGroupMembers('group-1')).resolves.toEqual(groupMembers)
    await expect(replaceGroupMembers('group-1', ['assistant-1'])).resolves.toEqual(
      groupMembers
    )

    await expect(listGroupThreads('group-1')).resolves.toEqual([threadRecord])
    await expect(
      createGroupThread({
        groupId: 'group-1',
        resourceId: 'default-profile'
      })
    ).resolves.toEqual(threadRecord)
    await expect(updateGroupThread('thread-1', { title: 'Launch Room' })).resolves.toEqual(
      updatedThreadRecord
    )
    await deleteGroupThread('thread-1')

    await expect(
      listGroupThreadMessages({
        threadId: 'thread-1',
        profileId: 'default-profile'
      })
    ).resolves.toEqual(roomMessages)
    await expect(
      submitGroupWatcherMessage({
        threadId: 'thread-1',
        profileId: 'default-profile',
        content: 'Plan the launch with @Planner',
        mentions: ['assistant-1']
      })
    ).resolves.toEqual({
      runId: 'run-1',
      messageId: 'msg-2'
    })

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:4769/v1/group/groups',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:4769/v1/group/groups/group-1/members',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      6,
      'http://127.0.0.1:4769/v1/group/threads?groupId=group-1',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      10,
      'http://127.0.0.1:4769/group-chat/thread-1/history?profileId=default-profile',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers)
      })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      11,
      'http://127.0.0.1:4769/group-chat/thread-1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify({
          profileId: 'default-profile',
          content: 'Plan the launch with @Planner',
          mentions: ['assistant-1']
        })
      })
    )
  })

  it('opens group status and thread event streams with authorization headers', async () => {
    const statusEvent: GroupStatusEvent = {
      type: 'turn-started',
      runId: 'run-1',
      threadId: 'thread-1',
      createdAt: '2026-03-13T00:00:00.000Z',
      data: {
        assistantId: 'assistant-1',
        assistantName: 'Planner'
      }
    }
    const threadEvent: GroupThreadEvent = {
      type: 'group-thread-message-created',
      threadId: 'thread-1',
      profileId: 'default-profile',
      messageId: 'msg-1',
      createdAt: '2026-03-13T00:00:00.000Z'
    }
    const encoder = new TextEncoder()
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusEvent)}\n\n`))
              controller.close()
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(threadEvent)}\n\n`))
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

    const onStatusEvent = vi.fn()
    const onThreadEvent = vi.fn()

    const statusHandle = openGroupStatusStream({
      threadId: 'thread-1',
      runId: 'run-1',
      onEvent: onStatusEvent
    })
    await statusHandle.done

    const threadHandle = openGroupThreadEventsStream({
      threadId: 'thread-1',
      profileId: 'default-profile',
      onEvent: onThreadEvent
    })
    await threadHandle.done

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:4769/group-chat/thread-1/runs/run-1/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer group-token'
        })
      })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4769/group-chat/thread-1/events?profileId=default-profile',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer group-token'
        })
      })
    )
    expect(onStatusEvent).toHaveBeenCalledWith(statusEvent)
    expect(onThreadEvent).toHaveBeenCalledWith(threadEvent)
  })

  it('retries group status stream lookups before surfacing the stream', async () => {
    vi.useFakeTimers()

    try {
      const statusEvent: GroupStatusEvent = {
        type: 'turn-started',
        runId: 'run-1',
        threadId: 'thread-1',
        createdAt: '2026-03-13T00:00:00.000Z',
        data: {
          assistantId: 'assistant-1',
          assistantName: 'Planner'
        }
      }
      const encoder = new TextEncoder()
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: false, error: 'Group run not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          })
        )
        .mockResolvedValueOnce(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusEvent)}\n\n`))
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

      const onStatusEvent = vi.fn()

      const statusHandle = openGroupStatusStream({
        threadId: 'thread-1',
        runId: 'run-1',
        onEvent: onStatusEvent
      })

      await vi.runAllTimersAsync()
      await statusHandle.done

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(onStatusEvent).toHaveBeenCalledWith(statusEvent)
    } finally {
      vi.useRealTimers()
    }
  })
})

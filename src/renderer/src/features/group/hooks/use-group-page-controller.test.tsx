// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const routeParams: { groupId?: string; threadId?: string } = {}

  return {
    routeParams,
    activeResourceId: 'default-profile',
    listGroupsMock: vi.fn(),
    createGroupMock: vi.fn(),
    updateGroupMock: vi.fn(),
    listGroupMembersMock: vi.fn(),
    replaceGroupMembersMock: vi.fn(),
    listGroupThreadsMock: vi.fn(),
    createGroupThreadMock: vi.fn(),
    updateGroupThreadMock: vi.fn(),
    deleteGroupThreadMock: vi.fn(),
    listGroupThreadMessagesMock: vi.fn(),
    submitGroupWatcherMessageMock: vi.fn(),
    openGroupStatusStreamMock: vi.fn(),
    openGroupThreadEventsStreamMock: vi.fn(),
    listAssistantsMock: vi.fn(),
    navigateMock: vi.fn()
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockState.navigateMock,
  useParams: () => ({ ...mockState.routeParams })
}))

vi.mock('../../assistants/assistants-query', () => ({
  listAssistants: (...args: unknown[]) => mockState.listAssistantsMock(...args)
}))

vi.mock('../group-groups-query', () => ({
  listGroups: (...args: unknown[]) => mockState.listGroupsMock(...args),
  createGroup: (...args: unknown[]) => mockState.createGroupMock(...args),
  updateGroup: (...args: unknown[]) => mockState.updateGroupMock(...args),
  listGroupMembers: (...args: unknown[]) => mockState.listGroupMembersMock(...args),
  replaceGroupMembers: (...args: unknown[]) => mockState.replaceGroupMembersMock(...args)
}))

vi.mock('../group-threads-query', () => ({
  listGroupThreads: (...args: unknown[]) => mockState.listGroupThreadsMock(...args),
  createGroupThread: (...args: unknown[]) => mockState.createGroupThreadMock(...args),
  updateGroupThread: (...args: unknown[]) => mockState.updateGroupThreadMock(...args),
  deleteGroupThread: (...args: unknown[]) => mockState.deleteGroupThreadMock(...args)
}))

vi.mock('../group-chat-query', () => ({
  listGroupThreadMessages: (...args: unknown[]) => mockState.listGroupThreadMessagesMock(...args),
  submitGroupWatcherMessage: (...args: unknown[]) =>
    mockState.submitGroupWatcherMessageMock(...args)
}))

vi.mock('../group-status-stream', () => ({
  openGroupStatusStream: (...args: unknown[]) => mockState.openGroupStatusStreamMock(...args)
}))

vi.mock('../group-thread-events-stream', () => ({
  openGroupThreadEventsStream: (...args: unknown[]) =>
    mockState.openGroupThreadEventsStreamMock(...args)
}))

vi.mock('../../threads/threads-query', () => ({
  getActiveResourceId: () => mockState.activeResourceId
}))

vi.mock('../../threads/thread-page-routing', () => ({
  toErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Unexpected request error'
}))

import { useGroupPageController, type GroupPageController } from './use-group-page-controller'

let controller: GroupPageController | null = null
let container: HTMLDivElement
let root: Root

function Harness({
  onControllerChange
}: {
  onControllerChange: (value: GroupPageController) => void
}): React.JSX.Element {
  const [, setRenderVersion] = useState(0)
  const latestController = useGroupPageController()

  useEffect(() => {
    onControllerChange(latestController)
  }, [latestController, onControllerChange])

  useEffect(() => {
    setRenderVersion((version) => version)
  }, [])

  return <div />
}

async function rerenderHarness(): Promise<void> {
  await act(async () => {
    root.render(
      <Harness
        onControllerChange={(value) => {
          controller = value
        }}
      />
    )
  })
}

async function waitForCondition(condition: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (condition()) {
      return
    }
    await act(async () => {
      await Promise.resolve()
    })
  }

  throw new Error(`Timed out waiting for ${description}`)
}

describe('useGroupPageController', () => {
  beforeEach(() => {
    mockState.routeParams.groupId = 'group-1'
    mockState.routeParams.threadId = 'thread-1'

    mockState.navigateMock.mockReset()
    mockState.navigateMock.mockImplementation((nextRoute: string) => {
      if (!nextRoute.startsWith('/group')) {
        return
      }

      const segments = nextRoute.split('/').filter((segment) => segment.length > 0)
      mockState.routeParams.groupId = segments[1]
      mockState.routeParams.threadId = segments[2]
    })
    mockState.activeResourceId = 'default-profile'

    mockState.listGroupsMock.mockReset()
    mockState.listGroupsMock.mockResolvedValue([
      {
        id: 'group-1',
        name: 'Launch Group',
        rootPath: '/Users/demo/project',
        groupDescription: 'Plan the launch.',
        maxAutoTurns: 6,
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    ])
    mockState.createGroupMock.mockReset()
    mockState.updateGroupMock.mockReset()
    mockState.listGroupMembersMock.mockReset()
    mockState.listGroupMembersMock.mockResolvedValue([
      {
        groupId: 'group-1',
        assistantId: 'assistant-1',
        sortOrder: 0,
        createdAt: '2026-03-13T00:00:00.000Z'
      }
    ])
    mockState.replaceGroupMembersMock.mockReset()

    mockState.listGroupThreadsMock.mockReset()
    mockState.listGroupThreadsMock.mockResolvedValue([
      {
        id: 'thread-1',
        groupId: 'group-1',
        resourceId: 'default-profile',
        title: 'Launch Room',
        lastMessageAt: null,
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    ])
    mockState.createGroupThreadMock.mockReset()
    mockState.updateGroupThreadMock.mockReset()
    mockState.deleteGroupThreadMock.mockReset()
    mockState.deleteGroupThreadMock.mockResolvedValue(undefined)

    mockState.listGroupThreadMessagesMock.mockReset()
    mockState.listGroupThreadMessagesMock.mockResolvedValue([])
    mockState.submitGroupWatcherMessageMock.mockReset()
    mockState.submitGroupWatcherMessageMock.mockResolvedValue({
      runId: 'run-1',
      messageId: 'msg-1'
    })

    mockState.openGroupStatusStreamMock.mockReset()
    mockState.openGroupStatusStreamMock.mockImplementation(
      ({
        onEvent
      }: {
        onEvent: (event: {
          type: string
          runId: string
          threadId: string
          createdAt: string
          data?: Record<string, unknown>
        }) => void
      }) => {
        onEvent({
          type: 'turn-started',
          runId: 'run-1',
          threadId: 'thread-1',
          createdAt: '2026-03-13T00:00:00.000Z',
          data: {
            assistantId: 'assistant-1',
            assistantName: 'Planner'
          }
        })
        return {
          close: () => undefined,
          done: Promise.resolve()
        }
      }
    )
    mockState.openGroupThreadEventsStreamMock.mockReset()
    mockState.openGroupThreadEventsStreamMock.mockReturnValue({
      close: () => undefined,
      done: Promise.resolve()
    })

    mockState.listAssistantsMock.mockReset()
    mockState.listAssistantsMock.mockResolvedValue([
      {
        id: 'assistant-1',
        name: 'Planner',
        description: '',
        instructions: '',
        enabled: true,
        providerId: 'provider-1',
        workspaceConfig: {},
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    ])

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    controller = null
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('loads groups, members, threads, and history for the selected route', async () => {
    await rerenderHarness()

    await waitForCondition(() => controller?.isLoadingData === false, 'group data to finish loading')
    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')
    await waitForCondition(
      () => controller?.selectedMembers.map((member) => member.name).join(',') === 'Planner',
      'selected members'
    )
    await waitForCondition(
      () => mockState.listGroupThreadMessagesMock.mock.calls.length > 0,
      'group history request'
    )

    expect(controller?.selectedGroup?.id).toBe('group-1')
    expect(controller?.selectedThread?.id).toBe('thread-1')
    expect(controller?.selectedMembers.map((member) => member.name)).toEqual(['Planner'])
    expect(mockState.openGroupThreadEventsStreamMock).toHaveBeenCalledWith({
      threadId: 'thread-1',
      profileId: 'default-profile',
      onEvent: expect.any(Function),
      onError: expect.any(Function)
    })
  })

  it('opens a status stream after submit and marks the active speaker as typing', async () => {
    await rerenderHarness()

    await waitForCondition(() => controller?.isLoadingData === false, 'group data to finish loading')
    await waitForCondition(() => controller?.readiness.canChat === true, 'group readiness')

    await act(async () => {
      await controller?.handleSubmitMessage({
        messageText: 'Plan the launch with @Planner',
        mentions: ['assistant-1']
      })
    })

    await waitForCondition(
      () => mockState.submitGroupWatcherMessageMock.mock.calls.length > 0,
      'group submit request'
    )
    await waitForCondition(
      () => mockState.openGroupStatusStreamMock.mock.calls.length > 0,
      'group status stream'
    )

    expect(mockState.submitGroupWatcherMessageMock).toHaveBeenCalledWith({
      threadId: 'thread-1',
      profileId: 'default-profile',
      content: 'Plan the launch with @Planner',
      mentions: ['assistant-1']
    })
    expect(mockState.openGroupStatusStreamMock).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-1',
      onEvent: expect.any(Function),
      onError: expect.any(Function)
    })
    expect(mockState.openGroupStatusStreamMock).toHaveBeenCalledTimes(1)
    expect(controller?.isAgentTyping).toBe(true)
    expect(controller?.activeSpeakerName).toBe('Planner')
  })

  it('does not reopen the thread events stream when history updates change thread metadata', async () => {
    let threadEventHandler: ((event: {
      type: 'group-thread-message-created'
      threadId: string
      profileId: string
      messageId: string
      createdAt: string
    }) => void) | null = null

    mockState.listGroupThreadMessagesMock.mockReset()
    mockState.listGroupThreadMessagesMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          id: 'msg-1',
          threadId: 'thread-1',
          role: 'user',
          authorType: 'watcher',
          authorId: null,
          authorName: 'You',
          content: 'Plan the launch',
          mentions: [],
          createdAt: '2026-03-13T00:00:01.000Z'
        }
      ])

    mockState.openGroupThreadEventsStreamMock.mockReset()
    mockState.openGroupThreadEventsStreamMock.mockImplementation(
      ({
        onEvent
      }: {
        onEvent: (event: {
          type: 'group-thread-message-created'
          threadId: string
          profileId: string
          messageId: string
          createdAt: string
        }) => void
      }) => {
        threadEventHandler = onEvent
        return {
          close: () => undefined,
          done: Promise.resolve()
        }
      }
    )

    await rerenderHarness()

    await waitForCondition(
      () => mockState.openGroupThreadEventsStreamMock.mock.calls.length === 1,
      'initial thread events stream'
    )

    await act(async () => {
      threadEventHandler?.({
        type: 'group-thread-message-created',
        threadId: 'thread-1',
        profileId: 'default-profile',
        messageId: 'msg-1',
        createdAt: '2026-03-13T00:00:01.000Z'
      })
    })

    await waitForCondition(
      () => mockState.listGroupThreadMessagesMock.mock.calls.length >= 2,
      'history refresh after thread event'
    )

    expect(mockState.openGroupThreadEventsStreamMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes room history when the status stream reports a posted message', async () => {
    let statusEventHandler: ((event: {
      type: string
      runId: string
      threadId: string
      createdAt: string
      data?: Record<string, unknown>
    }) => void) | null = null

    mockState.listGroupThreadMessagesMock.mockReset()
    mockState.listGroupThreadMessagesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'msg-1',
          threadId: 'thread-1',
          role: 'user',
          authorType: 'watcher',
          authorId: null,
          authorName: 'You',
          content: 'Plan the launch with @Planner',
          mentions: ['assistant-1'],
          createdAt: '2026-03-13T00:00:00.000Z'
        }
      ])
      .mockResolvedValue([
        {
          id: 'msg-1',
          threadId: 'thread-1',
          role: 'user',
          authorType: 'watcher',
          authorId: null,
          authorName: 'You',
          content: 'Plan the launch with @Planner',
          mentions: ['assistant-1'],
          createdAt: '2026-03-13T00:00:00.000Z'
        },
        {
          id: 'msg-2',
          threadId: 'thread-1',
          role: 'assistant',
          authorType: 'assistant',
          authorId: 'assistant-1',
          authorName: 'Planner',
          content: 'I can take the first pass.',
          mentions: [],
          createdAt: '2026-03-13T00:00:01.000Z'
        }
      ])

    mockState.openGroupStatusStreamMock.mockReset()
    mockState.openGroupStatusStreamMock.mockImplementation(
      ({
        onEvent
      }: {
        onEvent: (event: {
          type: string
          runId: string
          threadId: string
          createdAt: string
          data?: Record<string, unknown>
        }) => void
      }) => {
        statusEventHandler = onEvent
        return {
          close: () => undefined,
          done: Promise.resolve()
        }
      }
    )

    await rerenderHarness()

    await waitForCondition(() => controller?.readiness.canChat === true, 'group readiness')

    await act(async () => {
      await controller?.handleSubmitMessage({
        messageText: 'Plan the launch with @Planner',
        mentions: ['assistant-1']
      })
    })

    await waitForCondition(
      () => mockState.openGroupStatusStreamMock.mock.calls.length > 0,
      'group status stream'
    )

    await act(async () => {
      statusEventHandler?.({
        type: 'message-posted',
        runId: 'run-1',
        threadId: 'thread-1',
        createdAt: '2026-03-13T00:00:01.000Z',
        data: {
          assistantId: 'assistant-1',
          assistantName: 'Planner',
          messageId: 'msg-2'
        }
      })
    })

    await waitForCondition(
      () => mockState.listGroupThreadMessagesMock.mock.calls.length >= 3,
      'history refresh after status event'
    )

    expect(controller?.messages.at(-1)?.content).toBe('I can take the first pass.')
    expect(controller?.isAgentTyping).toBe(false)
  })
})

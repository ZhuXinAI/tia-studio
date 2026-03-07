// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const routeParams: { workspaceId?: string; threadId?: string } = {}

  return {
    routeParams,
    listTeamWorkspacesMock: vi.fn(),
    createTeamWorkspaceMock: vi.fn(),
    listTeamThreadsMock: vi.fn(),
    listTeamThreadMembersMock: vi.fn(),
    createTeamThreadMock: vi.fn(),
    updateTeamThreadMock: vi.fn(),
    replaceTeamThreadMembersMock: vi.fn(),
    listTeamThreadMessagesMock: vi.fn(),
    createTeamChatTransportMock: vi.fn(),
    openTeamStatusStreamMock: vi.fn(),
    listAssistantsMock: vi.fn(),
    listProvidersMock: vi.fn(),
    useChatMock: vi.fn(),
    sendMessageMock: vi.fn(),
    setMessagesMock: vi.fn(),
    stopMock: vi.fn(),
    navigateMock: vi.fn()
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockState.navigateMock,
  useParams: () => mockState.routeParams
}))

vi.mock('../../assistants/assistants-query', () => ({
  listAssistants: (...args: unknown[]) => mockState.listAssistantsMock(...args)
}))

vi.mock('../../settings/providers/providers-query', () => ({
  listProviders: (...args: unknown[]) => mockState.listProvidersMock(...args)
}))

vi.mock('../team-workspaces-query', () => ({
  listTeamWorkspaces: (...args: unknown[]) => mockState.listTeamWorkspacesMock(...args),
  createTeamWorkspace: (...args: unknown[]) => mockState.createTeamWorkspaceMock(...args)
}))

vi.mock('../team-threads-query', () => ({
  listTeamThreads: (...args: unknown[]) => mockState.listTeamThreadsMock(...args),
  listTeamThreadMembers: (...args: unknown[]) => mockState.listTeamThreadMembersMock(...args),
  createTeamThread: (...args: unknown[]) => mockState.createTeamThreadMock(...args),
  updateTeamThread: (...args: unknown[]) => mockState.updateTeamThreadMock(...args),
  replaceTeamThreadMembers: (...args: unknown[]) =>
    mockState.replaceTeamThreadMembersMock(...args)
}))

vi.mock('../team-chat-query', () => ({
  listTeamThreadMessages: (...args: unknown[]) => mockState.listTeamThreadMessagesMock(...args),
  createTeamChatTransport: (...args: unknown[]) => mockState.createTeamChatTransportMock(...args)
}))

vi.mock('../team-status-stream', () => ({
  openTeamStatusStream: (...args: unknown[]) => mockState.openTeamStatusStreamMock(...args)
}))

vi.mock('../../threads/threads-query', () => ({
  getActiveResourceId: () => 'default-profile'
}))

vi.mock('../../threads/thread-page-routing', () => ({
  toErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Unexpected request error')
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) =>
    mockState.useChatMock(options) ?? {
      sendMessage: mockState.sendMessageMock,
      setMessages: mockState.setMessagesMock,
      stop: mockState.stopMock,
      status: 'ready',
      error: null,
      messages: []
    }
}))

import { useTeamPageController, type TeamPageController } from './use-team-page-controller'

let controller: TeamPageController | null = null
let container: HTMLDivElement
let root: Root

function Harness({
  onControllerChange
}: {
  onControllerChange: (value: TeamPageController) => void
}): React.JSX.Element {
  const [, setRenderVersion] = useState(0)
  const latestController = useTeamPageController()

  useEffect(() => {
    onControllerChange(latestController)
  }, [latestController, onControllerChange])

  useEffect(() => {
    setRenderVersion((version) => version)
  }, [])

  return <div />
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

describe('useTeamPageController', () => {
  beforeEach(() => {
    mockState.routeParams.workspaceId = 'workspace-1'
    mockState.routeParams.threadId = 'thread-1'

    mockState.navigateMock.mockReset()
    mockState.listTeamWorkspacesMock.mockReset()
    mockState.listTeamWorkspacesMock.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }
    ])
    mockState.createTeamWorkspaceMock.mockReset()
    mockState.createTeamThreadMock.mockReset()
    mockState.updateTeamThreadMock.mockReset()
    mockState.replaceTeamThreadMembersMock.mockReset()

    mockState.listTeamThreadsMock.mockReset()
    mockState.listTeamThreadsMock.mockResolvedValue([
      {
        id: 'thread-1',
        workspaceId: 'workspace-1',
        resourceId: 'default-profile',
        title: 'Release Team',
        teamDescription: 'Coordinate the release checklist.',
        supervisorProviderId: 'provider-1',
        supervisorModel: 'gpt-5',
        lastMessageAt: null,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }
    ])
    mockState.listTeamThreadMembersMock.mockReset()
    mockState.listTeamThreadMembersMock.mockResolvedValue([])
    mockState.listTeamThreadMessagesMock.mockReset()
    mockState.listTeamThreadMessagesMock.mockResolvedValue([])
    mockState.createTeamChatTransportMock.mockReset()
    mockState.createTeamChatTransportMock.mockReturnValue({} as object)
    mockState.openTeamStatusStreamMock.mockReset()
    mockState.openTeamStatusStreamMock.mockReturnValue({
      close: () => undefined,
      done: Promise.resolve()
    })

    mockState.listAssistantsMock.mockReset()
    mockState.listAssistantsMock.mockResolvedValue([
      {
        id: 'assistant-1',
        name: 'Planner',
        instructions: '',
        providerId: 'provider-1',
        workspaceConfig: {},
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }
    ])
    mockState.listProvidersMock.mockReset()
    mockState.listProvidersMock.mockResolvedValue([
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'secret',
        apiHost: null,
        selectedModel: 'gpt-5',
        providerModels: null,
        enabled: true,
        supportsVision: false,
        isBuiltIn: false,
        icon: null,
        officialSite: null,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }
    ])

    mockState.useChatMock.mockReset()
    mockState.useChatMock.mockImplementation(() => ({
      sendMessage: mockState.sendMessageMock,
      setMessages: mockState.setMessagesMock,
      stop: mockState.stopMock,
      status: 'ready',
      error: null,
      messages: []
    }))
    mockState.sendMessageMock.mockReset()
    mockState.setMessagesMock.mockReset()
    mockState.stopMock.mockReset()

    controller = null
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('blocks send when the team thread has no members', async () => {
    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
        />
      )
    })

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'team thread load')

    expect(controller?.readiness.canChat).toBe(false)
    expect(controller?.readiness.checks.map((check) => check.id)).toContain('members')
    expect(controller?.selectedMembers).toEqual([])
  })
})

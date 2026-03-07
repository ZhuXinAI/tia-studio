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
    updateTeamWorkspaceMock: vi.fn(),
    listTeamWorkspaceMembersMock: vi.fn(),
    replaceTeamWorkspaceMembersMock: vi.fn(),
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
  createTeamWorkspace: (...args: unknown[]) => mockState.createTeamWorkspaceMock(...args),
  updateTeamWorkspace: (...args: unknown[]) => mockState.updateTeamWorkspaceMock(...args),
  listTeamWorkspaceMembers: (...args: unknown[]) => mockState.listTeamWorkspaceMembersMock(...args),
  replaceTeamWorkspaceMembers: (...args: unknown[]) =>
    mockState.replaceTeamWorkspaceMembersMock(...args)
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
    mockState.navigateMock.mockImplementation((nextRoute: string) => {
      const segments = nextRoute.split('/').filter((segment) => segment.length > 0)
      mockState.routeParams.workspaceId = segments[1]
      mockState.routeParams.threadId = segments[2]
    })
    mockState.listTeamWorkspacesMock.mockReset()
    mockState.listTeamWorkspacesMock.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }
    ])
    mockState.createTeamWorkspaceMock.mockReset()
    mockState.createTeamWorkspaceMock.mockResolvedValue({
      id: 'workspace-2',
      name: 'new-workspace',
      rootPath: '/Users/demo/new-workspace',
      teamDescription: '',
      supervisorProviderId: null,
      supervisorModel: '',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:00.000Z'
    })
    mockState.updateTeamWorkspaceMock.mockReset()
    mockState.listTeamWorkspaceMembersMock.mockReset()
    mockState.listTeamWorkspaceMembersMock.mockResolvedValue([])
    mockState.replaceTeamWorkspaceMembersMock.mockReset()
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

    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'team-token'
      })),
      pickDirectory: vi.fn(async () => '/Users/demo/new-workspace')
    }

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

  it('blocks send when the selected workspace has no members', async () => {
    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
        />
      )
    })

    await waitForCondition(
      () => controller?.selectedWorkspace?.id === 'workspace-1',
      'workspace load'
    )

    expect(controller?.readiness.canChat).toBe(false)
    expect(controller?.readiness.checks.map((check) => check.id)).toContain('members')
    expect(controller?.selectedMembers).toEqual([])
  })

  it('treats sparse workspace payloads as not ready instead of crashing', async () => {
    mockState.listTeamWorkspacesMock.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Docs Workspace',
        teamDescription: '',
        supervisorProviderId: null,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      } as unknown
    ])

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
        />
      )
    })

    await waitForCondition(
      () => controller?.selectedWorkspace?.id === 'workspace-1',
      'workspace load with sparse payload'
    )

    expect(controller?.readiness.canChat).toBe(false)
    expect(controller?.readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'workspace', ready: false }),
        expect.objectContaining({ id: 'model', ready: false })
      ])
    )
  })

  it('opens config immediately after creating a workspace', async () => {
    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
        />
      )
    })

    await waitForCondition(() => controller?.selectedWorkspace?.id === 'workspace-1', 'initial workspace load')

    await act(async () => {
      await controller?.handleCreateWorkspace()
    })

    await waitForCondition(
      () => controller?.selectedWorkspace?.id === 'workspace-2' && controller?.isConfigDialogOpen === true,
      'new workspace selection and config dialog'
    )

    expect(mockState.createTeamWorkspaceMock).toHaveBeenCalledWith({
      name: 'new-workspace',
      rootPath: '/Users/demo/new-workspace'
    })
  })

  it('saves team config at workspace scope even when no thread is selected', async () => {
    mockState.routeParams.threadId = undefined
    mockState.listTeamThreadsMock.mockResolvedValue([])
    mockState.listTeamWorkspaceMembersMock.mockResolvedValue([
      {
        workspaceId: 'workspace-1',
        assistantId: 'assistant-1',
        sortOrder: 0,
        createdAt: '2026-03-07T00:00:00.000Z'
      }
    ])
    mockState.updateTeamWorkspaceMock.mockResolvedValue({
      id: 'workspace-1',
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project',
      teamDescription: 'Coordinate docs release',
      supervisorProviderId: 'provider-1',
      supervisorModel: 'gpt-5',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:00.000Z'
    })
    mockState.replaceTeamWorkspaceMembersMock.mockResolvedValue([
      {
        workspaceId: 'workspace-1',
        assistantId: 'assistant-1',
        sortOrder: 0,
        createdAt: '2026-03-07T00:00:00.000Z'
      }
    ])

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
        />
      )
    })

    await waitForCondition(
      () => controller?.selectedWorkspace?.id === 'workspace-1' && controller?.selectedThread === null,
      'workspace-only selection'
    )

    act(() => {
      controller?.openConfigDialog()
    })

    await act(async () => {
      await controller?.handleSubmitConfig({
        teamDescription: 'Coordinate docs release',
        supervisorProviderId: 'provider-1',
        supervisorModel: 'gpt-5',
        assistantIds: ['assistant-1']
      })
    })

    expect(mockState.updateTeamWorkspaceMock).toHaveBeenCalledWith('workspace-1', {
      teamDescription: 'Coordinate docs release',
      supervisorProviderId: 'provider-1',
      supervisorModel: 'gpt-5'
    })
    expect(mockState.replaceTeamWorkspaceMembersMock).toHaveBeenCalledWith('workspace-1', [
      'assistant-1'
    ])
    expect(controller?.selectedMemberIds).toEqual(['assistant-1'])
    expect(controller?.isConfigDialogOpen).toBe(false)
  })

  it('creates new team threads without a title payload', async () => {
    mockState.createTeamThreadMock.mockResolvedValue({
      id: 'thread-2',
      workspaceId: 'workspace-1',
      resourceId: 'default-profile',
      title: '',
      teamDescription: '',
      supervisorProviderId: null,
      supervisorModel: '',
      lastMessageAt: null,
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:00.000Z'
    })

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
        />
      )
    })

    await waitForCondition(() => controller?.selectedWorkspace?.id === 'workspace-1', 'workspace load')

    await act(async () => {
      await controller?.handleCreateThread()
    })

    expect(mockState.createTeamThreadMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      resourceId: 'default-profile'
    })
  })
})

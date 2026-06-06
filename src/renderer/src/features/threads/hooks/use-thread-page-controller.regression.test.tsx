// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThreadPageController, type ThreadPageController } from './use-thread-page-controller'

const mockState = vi.hoisted(() => {
  const routeParams: { workspaceId?: string; threadId?: string } = {}
  const setMessagesCalls: unknown[][] = []
  const assistantsData = [
    {
      id: 'assistant-1',
      name: 'Planner',
      instructions: 'Keep responses concise.',
      providerId: 'provider-1',
      workspaceConfig: { rootPath: '/workspace/demo' },
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    }
  ]
  const workspacesData = [
    {
      id: 'workspace-chats',
      name: 'Chats',
      rootPath: '/tmp/tia-studio/chats',
      builtInKind: 'chats',
      defaultAssistantId: null,
      isMissing: false
    }
  ]
  const providersData = [
    {
      id: 'provider-1',
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      apiHost: 'https://api.openai.com/v1',
      selectedModel: 'gpt-5',
      providerModels: null,
      enabled: true,
      supportsVision: false,
      isBuiltIn: false,
      icon: null,
      officialSite: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    }
  ]
  const emptyThreads: unknown[] = []
  const idleMutation = {
    isPending: false,
    variables: null,
    mutateAsync: vi.fn()
  }

  return {
    routeParams,
    routePath: '/chat',
    setMessagesCalls,
    assistantsData,
    workspacesData,
    providersData,
    emptyThreads,
    idleMutation,
    navigateMock: vi.fn(),
    getMcpServersSettingsMock: vi.fn(),
    clawsData: {
      claws: [],
      configuredChannels: []
    },
    updateClawMock: vi.fn(),
    createClawChannelMock: vi.fn(),
    updateClawChannelMock: vi.fn(),
    deleteClawChannelMock: vi.fn(),
    relocateWorkspaceMock: vi.fn(),
    deleteWorkspaceMock: vi.fn(),
    useChatMock: vi.fn()
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockState.navigateMock,
  useParams: () => mockState.routeParams,
  useLocation: () => ({
    pathname: mockState.routePath,
    search: '',
    hash: '',
    state: null,
    key: 'test'
  })
}))

vi.mock('../../assistants/assistants-query', () => ({
  useAssistants: () => ({
    data: mockState.assistantsData,
    isLoading: false,
    error: null
  }),
  useCreateAssistant: () => mockState.idleMutation,
  useUpdateAssistant: () => mockState.idleMutation,
  useDeleteAssistant: () => mockState.idleMutation
}))

vi.mock('../../settings/providers/providers-query', () => ({
  useProviders: () => ({
    data: mockState.providersData,
    isLoading: false,
    error: null
  })
}))

vi.mock('../../workspaces/workspaces-query', () => ({
  useWorkspaces: () => ({
    data: mockState.workspacesData,
    isLoading: false,
    error: null
  }),
  useRelocateWorkspace: () => ({
    isPending: false,
    mutateAsync: mockState.relocateWorkspaceMock
  }),
  useDeleteWorkspace: () => ({
    isPending: false,
    mutateAsync: mockState.deleteWorkspaceMock
  })
}))

vi.mock('../../settings/mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: () => mockState.getMcpServersSettingsMock()
}))

vi.mock('../../claws/claws-query', () => ({
  clawKeys: {
    list: () => ['claws', 'list']
  },
  useClaws: () => ({
    data: mockState.clawsData,
    isLoading: false,
    error: null
  }),
  updateClaw: (...args: unknown[]) => mockState.updateClawMock(...args),
  createClawChannel: (...args: unknown[]) => mockState.createClawChannelMock(...args),
  updateClawChannel: (...args: unknown[]) => mockState.updateClawChannelMock(...args),
  deleteClawChannel: (...args: unknown[]) => mockState.deleteClawChannelMock(...args)
}))

vi.mock('../threads-query', () => ({
  useThreads: () => ({
    data: mockState.emptyThreads,
    isLoading: false
  }),
  useCreateThread: () => mockState.idleMutation,
  useDeleteThread: () => mockState.idleMutation,
  getActiveResourceId: () => 'default-profile',
  listThreads: vi.fn()
}))

vi.mock('../chat-query', () => ({
  createThreadChatTransport: vi.fn(),
  listThreadChatMessages: vi.fn(),
  openAssistantMessageEventsStream: vi.fn(() => ({
    close: vi.fn(),
    done: Promise.resolve()
  }))
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) => mockState.useChatMock(options)
}))

let controller: ThreadPageController | null = null
let forceRerender: (() => void) | null = null
let container: HTMLDivElement
let root: Root

function applyRoute(to: string): void {
  mockState.routePath = to
  delete mockState.routeParams.workspaceId
  delete mockState.routeParams.threadId

  const workspaceThreadMatch = /^\/workspaces\/([^/]+)\/threads\/([^/]+)$/.exec(to)
  if (workspaceThreadMatch) {
    mockState.routeParams.workspaceId = workspaceThreadMatch[1]
    mockState.routeParams.threadId = workspaceThreadMatch[2]
    return
  }

  const workspaceRootMatch = /^\/workspaces\/([^/]+)(?:\/new)?$/.exec(to)
  if (workspaceRootMatch) {
    mockState.routeParams.workspaceId = workspaceRootMatch[1]
    return
  }

  const chatThreadMatch = /^\/chat\/([^/]+)$/.exec(to)
  if (chatThreadMatch && chatThreadMatch[1] !== 'new') {
    mockState.routeParams.threadId = chatThreadMatch[1]
  }
}

function Harness(): React.JSX.Element {
  const [, setRenderVersion] = useState(0)
  const latestController = useThreadPageController()

  useEffect(() => {
    controller = latestController
  }, [latestController])

  useEffect(() => {
    forceRerender = () => {
      setRenderVersion((version) => version + 1)
    }
  }, [])

  return <div />
}

async function flushReact(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useThreadPageController regression coverage', () => {
  beforeEach(() => {
    mockState.routePath = '/chat'
    delete mockState.routeParams.workspaceId
    delete mockState.routeParams.threadId
    mockState.setMessagesCalls.splice(0, mockState.setMessagesCalls.length)

    mockState.navigateMock.mockReset()
    mockState.navigateMock.mockImplementation((to: string) => {
      applyRoute(to)
    })
    mockState.getMcpServersSettingsMock.mockReset()
    mockState.getMcpServersSettingsMock.mockImplementation(
      () => new Promise<Record<string, unknown>>(() => undefined)
    )
    mockState.clawsData = {
      claws: [],
      configuredChannels: []
    }
    mockState.updateClawMock.mockReset()
    mockState.createClawChannelMock.mockReset()
    mockState.updateClawChannelMock.mockReset()
    mockState.deleteClawChannelMock.mockReset()
    mockState.relocateWorkspaceMock.mockReset()
    mockState.relocateWorkspaceMock.mockResolvedValue(undefined)
    mockState.deleteWorkspaceMock.mockReset()
    mockState.deleteWorkspaceMock.mockResolvedValue(undefined)

    mockState.useChatMock.mockReset()
    mockState.useChatMock.mockImplementation(() => {
      const setMessages = vi.fn((messages: unknown[]) => {
        mockState.setMessagesCalls.push(messages)
      })

      return {
        sendMessage: vi.fn(),
        setMessages,
        stop: vi.fn(),
        status: 'ready',
        error: null,
        messages: []
      }
    })

    controller = null
    forceRerender = null
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
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('clears composer messages only once for Chats routes', async () => {
    await act(async () => {
      root.render(<Harness />)
    })

    await flushReact()

    expect(controller?.selectedAssistant?.id).toBe('assistant-1')
    const initialResetCount = mockState.setMessagesCalls.length

    act(() => {
      forceRerender?.()
    })

    await flushReact()

    expect(mockState.setMessagesCalls).toHaveLength(initialResetCount)
  })
})

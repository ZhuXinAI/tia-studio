// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const routeParams: { assistantId?: string; threadId?: string } = {}
  const sendResolvers: Array<() => void> = []

  return {
    routeParams,
    sendResolvers,
    chatStatus: 'ready' as 'ready' | 'submitted' | 'streaming',
    assistantsData: [] as Array<Record<string, unknown>>,
    providersData: [] as Array<Record<string, unknown>>,
    threadsData: [] as Array<Record<string, unknown>>,
    listAssistantsMock: vi.fn(),
    createAssistantMock: vi.fn(),
    updateAssistantMock: vi.fn(),
    deleteAssistantMock: vi.fn(),
    listProvidersMock: vi.fn(),
    getMcpServersSettingsMock: vi.fn(),
    listThreadsMock: vi.fn(),
    createThreadMock: vi.fn(),
    deleteThreadMock: vi.fn(),
    createThreadChatTransportMock: vi.fn(),
    listThreadChatMessagesMock: vi.fn(),
    openAssistantMessageEventsStreamMock: vi.fn(),
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
  useAssistants: () => ({
    data: mockState.assistantsData,
    isLoading: false,
    error: null
  }),
  useCreateAssistant: () => ({
    isPending: false,
    mutateAsync: mockState.createAssistantMock
  }),
  useUpdateAssistant: () => ({
    isPending: false,
    mutateAsync: mockState.updateAssistantMock
  }),
  useDeleteAssistant: () => ({
    isPending: false,
    variables: null,
    mutateAsync: mockState.deleteAssistantMock
  }),
  listAssistants: (...args: unknown[]) => mockState.listAssistantsMock(...args),
  createAssistant: (...args: unknown[]) => mockState.createAssistantMock(...args),
  updateAssistant: (...args: unknown[]) => mockState.updateAssistantMock(...args),
  deleteAssistant: (...args: unknown[]) => mockState.deleteAssistantMock(...args)
}))

vi.mock('../../settings/providers/providers-query', () => ({
  useProviders: () => ({
    data: mockState.providersData,
    isLoading: false,
    error: null
  }),
  listProviders: (...args: unknown[]) => mockState.listProvidersMock(...args)
}))

vi.mock('../../settings/mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: (...args: unknown[]) => mockState.getMcpServersSettingsMock(...args)
}))

vi.mock('../threads-query', () => ({
  useThreads: () => ({
    data: mockState.threadsData,
    isLoading: false
  }),
  useCreateThread: () => ({
    isPending: false,
    mutateAsync: mockState.createThreadMock
  }),
  useDeleteThread: () => ({
    isPending: false,
    variables: null,
    mutateAsync: mockState.deleteThreadMock
  }),
  createThread: (...args: unknown[]) => mockState.createThreadMock(...args),
  deleteThread: (...args: unknown[]) => mockState.deleteThreadMock(...args),
  getActiveResourceId: () => 'default-profile',
  listThreads: (...args: unknown[]) => mockState.listThreadsMock(...args)
}))

vi.mock('../chat-query', () => ({
  createThreadChatTransport: (...args: unknown[]) =>
    mockState.createThreadChatTransportMock(...args),
  listThreadChatMessages: (...args: unknown[]) => mockState.listThreadChatMessagesMock(...args),
  openAssistantMessageEventsStream: (...args: unknown[]) =>
    mockState.openAssistantMessageEventsStreamMock(...args)
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) =>
    mockState.useChatMock(options) ?? {
      sendMessage: mockState.sendMessageMock,
      setMessages: mockState.setMessagesMock,
      stop: mockState.stopMock,
      status: mockState.chatStatus,
      error: null,
      messages: []
    }
}))

import { useThreadPageController, type ThreadPageController } from './use-thread-page-controller'

let controller: ThreadPageController | null = null
let forceRerender: (() => void) | null = null
let container: HTMLDivElement
let root: Root

type HarnessProps = {
  onControllerChange: (value: ThreadPageController) => void
  onForceRerenderReady: (value: () => void) => void
}

function Harness({ onControllerChange, onForceRerenderReady }: HarnessProps): React.JSX.Element {
  const [, setRenderVersion] = useState(0)
  const latestController = useThreadPageController()

  useEffect(() => {
    onForceRerenderReady(() => {
      setRenderVersion((version) => version + 1)
    })
  }, [onForceRerenderReady])

  useEffect(() => {
    onControllerChange(latestController)
  }, [latestController, onControllerChange])

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

describe('useThreadPageController', () => {
  beforeEach(() => {
    mockState.routeParams.assistantId = 'assistant-1'
    delete mockState.routeParams.threadId
    mockState.chatStatus = 'ready'
    mockState.sendResolvers.splice(0, mockState.sendResolvers.length)

    mockState.navigateMock.mockReset()
    mockState.navigateMock.mockImplementation((to: string) => {
      const parts = to.split('/').filter(Boolean)
      mockState.routeParams.assistantId = parts[1]
      mockState.routeParams.threadId = parts[2]
    })

    mockState.listAssistantsMock.mockReset()
    mockState.listAssistantsMock.mockResolvedValue([
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
    ])
    mockState.assistantsData = [
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
    mockState.createAssistantMock.mockReset()
    mockState.createAssistantMock.mockResolvedValue({
      id: 'assistant-2',
      name: 'Reviewer',
      instructions: '',
      providerId: 'provider-1',
      workspaceConfig: { rootPath: '/workspace/reviewer' },
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    })
    mockState.updateAssistantMock.mockReset()
    mockState.updateAssistantMock.mockResolvedValue({
      id: 'assistant-1',
      name: 'Planner',
      instructions: '',
      providerId: 'provider-1',
      workspaceConfig: { rootPath: '/workspace/demo' },
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    })
    mockState.deleteAssistantMock.mockReset()
    mockState.deleteAssistantMock.mockResolvedValue(undefined)

    mockState.listProvidersMock.mockReset()
    mockState.listProvidersMock.mockResolvedValue([
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'secret',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5',
        providerModels: null,
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ])
    mockState.providersData = [
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

    mockState.getMcpServersSettingsMock.mockReset()
    mockState.getMcpServersSettingsMock.mockResolvedValue({ mcpServers: {} })

    mockState.listThreadsMock.mockReset()
    mockState.listThreadsMock.mockResolvedValue([])
    mockState.threadsData = []

    mockState.createThreadMock.mockReset()
    mockState.createThreadMock.mockResolvedValue({
      id: 'thread-1',
      assistantId: 'assistant-1',
      resourceId: 'default-profile',
      title: 'New Thread',
      lastMessageAt: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    })

    mockState.deleteThreadMock.mockReset()
    mockState.deleteThreadMock.mockResolvedValue(undefined)

    mockState.listThreadChatMessagesMock.mockReset()
    mockState.listThreadChatMessagesMock.mockResolvedValue([])

    mockState.openAssistantMessageEventsStreamMock.mockReset()
    mockState.openAssistantMessageEventsStreamMock.mockReturnValue({
      close: vi.fn(),
      done: Promise.resolve()
    })

    mockState.createThreadChatTransportMock.mockReset()
    mockState.createThreadChatTransportMock.mockReturnValue({} as object)

    mockState.useChatMock.mockReset()
    mockState.useChatMock.mockImplementation(() => ({
      sendMessage: mockState.sendMessageMock,
      setMessages: mockState.setMessagesMock,
      stop: mockState.stopMock,
      status: mockState.chatStatus,
      error: null,
      messages: []
    }))

    mockState.sendMessageMock.mockReset()
    mockState.sendMessageMock.mockImplementation(() => {
      mockState.chatStatus = 'streaming'
      return new Promise<void>((resolve) => {
        mockState.sendResolvers.push(() => {
          mockState.chatStatus = 'ready'
          resolve()
        })
      })
    })

    mockState.setMessagesMock.mockReset()
    mockState.setMessagesMock.mockImplementation(() => undefined)

    mockState.stopMock.mockReset()
    mockState.stopMock.mockImplementation(() => undefined)

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
    vi.clearAllMocks()
  })

  it('does not resend the pending first message after stream completion', async () => {
    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
          onForceRerenderReady={(value) => {
            forceRerender = value
          }}
        />
      )
    })

    await waitForCondition(() => controller?.selectedAssistant?.id === 'assistant-1', 'assistant')

    await act(async () => {
      await controller?.onSubmitMessage('Draft an agenda for planning')
    })

    expect(mockState.createThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: ''
      })
    )

    await waitForCondition(
      () => mockState.sendMessageMock.mock.calls.length === 1,
      'first send invocation'
    )

    await act(async () => {
      forceRerender?.()
    })

    await act(async () => {
      const resolveSend = mockState.sendResolvers.shift()
      if (!resolveSend) {
        throw new Error('Missing pending send resolver')
      }
      resolveSend()
    })

    await act(async () => {
      forceRerender?.()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockState.sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the chat root route in assistant directory mode', async () => {
    delete mockState.routeParams.assistantId
    delete mockState.routeParams.threadId

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
          onForceRerenderReady={(value) => {
            forceRerender = value
          }}
        />
      )
    })

    await waitForCondition(() => controller !== null, 'controller to mount')

    expect(controller?.selectedAssistant).toBeNull()
    expect(mockState.navigateMock).not.toHaveBeenCalled()
  })

  it('asks for confirmation before deleting an assistant', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
          onForceRerenderReady={(value) => {
            forceRerender = value
          }}
        />
      )
    })

    await waitForCondition(() => controller?.selectedAssistant?.id === 'assistant-1', 'assistant')

    await act(async () => {
      controller?.onDeleteAssistant('assistant-1')
      await Promise.resolve()
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(mockState.deleteAssistantMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('enables stream resumption when a thread is selected', async () => {
    mockState.routeParams.threadId = 'thread-1'
    mockState.listThreadsMock.mockResolvedValue([
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'default-profile',
        title: 'New Thread',
        lastMessageAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ])
    mockState.threadsData = [
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'default-profile',
        title: 'New Thread',
        lastMessageAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ]

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
          onForceRerenderReady={(value) => {
            forceRerender = value
          }}
        />
      )
    })

    await waitForCondition(
      () =>
        mockState.useChatMock.mock.calls.some((call) => {
          const options = call[0] as { resume?: boolean } | undefined
          return options?.resume === true
        }),
      'useChat resume mode'
    )
  })

  it('clears stale messages before loading selected thread history', async () => {
    mockState.routeParams.threadId = 'thread-1'
    mockState.threadsData = [
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'default-profile',
        title: 'Recovered thread',
        lastMessageAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ]

    let resolveHistory: ((messages: unknown[]) => void) | null = null
    mockState.listThreadChatMessagesMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHistory = resolve
        })
    )

    await act(async () => {
      root.render(
        <Harness
          onControllerChange={(value) => {
            controller = value
          }}
          onForceRerenderReady={(value) => {
            forceRerender = value
          }}
        />
      )
    })

    await waitForCondition(
      () => mockState.listThreadChatMessagesMock.mock.calls.length === 1,
      'thread history request'
    )

    expect(mockState.setMessagesMock).toHaveBeenCalledWith([])

    await act(async () => {
      resolveHistory?.([])
      await Promise.resolve()
    })

    expect(mockState.setMessagesMock).toHaveBeenLastCalledWith([])
  })
})

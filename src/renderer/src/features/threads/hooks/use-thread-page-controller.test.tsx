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
    chatMessages: [] as Array<Record<string, unknown>>,
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
    runThreadCommandMock: vi.fn(),
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
  runThreadCommand: (...args: unknown[]) => mockState.runThreadCommandMock(...args),
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
      messages: mockState.chatMessages
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

function readMessageText(message: unknown): string | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const parts = Array.isArray((message as { parts?: unknown[] }).parts)
    ? ((message as { parts: Array<Record<string, unknown>> }).parts ?? [])
    : []
  const textPart = parts.find(
    (part) => part.type === 'text' && typeof part.text === 'string'
  ) as { text?: string } | undefined

  return typeof textPart?.text === 'string' ? textPart.text : null
}

function readMessageTexts(messages: unknown): string[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.flatMap((message) => {
    const text = readMessageText(message)
    return text ? [text] : []
  })
}

describe('useThreadPageController', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockState.routeParams.assistantId = 'assistant-1'
    delete mockState.routeParams.threadId
    mockState.chatStatus = 'ready'
    mockState.chatMessages = []
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

    mockState.runThreadCommandMock.mockReset()
    mockState.runThreadCommandMock.mockResolvedValue({
      ok: true,
      handled: true,
      command: 'new',
      archiveFileName: 'thread_history_2026-03-14.md',
      archiveFilePath: '/workspace/demo/thread_history_2026-03-14.md',
      threadTitle: 'Recovered thread',
      compactedAt: '2026-03-14T00:00:00.000Z'
    })

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
      messages: mockState.chatMessages
    }))

    mockState.sendMessageMock.mockReset()
    mockState.sendMessageMock.mockImplementation((message: unknown) => {
      if (message && typeof message === 'object') {
        mockState.chatMessages = [...mockState.chatMessages, message as Record<string, unknown>]
      }
      mockState.chatStatus = 'streaming'
      return new Promise<void>((resolve) => {
        mockState.sendResolvers.push(() => {
          mockState.chatStatus = 'ready'
          resolve()
        })
      })
    })

    mockState.setMessagesMock.mockReset()
    mockState.setMessagesMock.mockImplementation((messages: unknown) => {
      if (Array.isArray(messages)) {
        mockState.chatMessages = [...messages] as Array<Record<string, unknown>>
      }
    })

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

  it('restores the stored assistant thread when loading /chat without route params', async () => {
    delete mockState.routeParams.assistantId
    delete mockState.routeParams.threadId
    mockState.listThreadsMock.mockResolvedValue([
      {
        id: 'thread-1',
        assistantId: 'assistant-1',
        resourceId: 'default-profile',
        title: 'Stored thread',
        lastMessageAt: '2026-03-02T00:00:00.000Z',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ])
    window.localStorage.setItem(
      'tia.chat.last-thread-selection',
      JSON.stringify({
        assistantId: 'assistant-1',
        threadId: 'thread-1'
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
      () =>
        mockState.navigateMock.mock.calls.some(
          ([to, options]) =>
            to === '/chat/assistant-1/thread-1' &&
            (options as { replace?: boolean } | undefined)?.replace === true
        ),
      'stored chat route restore'
    )
  })

  it('routes /chat to the latest thread across assistants when no stored selection exists', async () => {
    delete mockState.routeParams.assistantId
    delete mockState.routeParams.threadId
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
      },
      {
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
      },
      {
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
      }
    ]
    mockState.listThreadsMock.mockImplementation(async (assistantId: unknown) => {
      if (assistantId === 'assistant-1') {
        return [
          {
            id: 'thread-1',
            assistantId: 'assistant-1',
            resourceId: 'default-profile',
            title: 'Older thread',
            lastMessageAt: '2026-03-02T00:00:00.000Z',
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-02T00:00:00.000Z'
          }
        ]
      }

      return [
        {
          id: 'thread-2',
          assistantId: 'assistant-2',
          resourceId: 'default-profile',
          title: 'Latest thread',
          lastMessageAt: '2026-03-03T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-03T00:00:00.000Z'
        }
      ]
    })

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
        mockState.navigateMock.mock.calls.some(
          ([to, options]) =>
            to === '/chat/assistant-2/thread-2' &&
            (options as { replace?: boolean } | undefined)?.replace === true
        ),
      'latest thread route restore'
    )
  })

  it('routes /chat to the first assistant detail when assistants exist but no threads do', async () => {
    delete mockState.routeParams.assistantId
    delete mockState.routeParams.threadId
    mockState.listThreadsMock.mockResolvedValue([])

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
        mockState.navigateMock.mock.calls.some(
          ([to, options]) =>
            to === '/chat/assistant-1' &&
            (options as { replace?: boolean } | undefined)?.replace === true
        ),
      'first assistant route restore'
    )
  })

  it('routes /chat to /claws when there are no assistants to restore', async () => {
    delete mockState.routeParams.assistantId
    delete mockState.routeParams.threadId
    mockState.assistantsData = []
    mockState.listAssistantsMock.mockResolvedValue([])

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
        mockState.navigateMock.mock.calls.some(
          ([to, options]) =>
            to === '/claws' && (options as { replace?: boolean } | undefined)?.replace === true
        ),
      'claws fallback route'
    )
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

  it('keeps an in-flight submitted user message visible when re-entering a thread', async () => {
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
    mockState.listThreadChatMessagesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'msg-existing',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Earlier reply' }]
        }
      ])

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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')
    await waitForCondition(
      () => mockState.listThreadChatMessagesMock.mock.calls.length === 1,
      'initial thread history request'
    )

    await act(async () => {
      void controller?.onSubmitMessage('Please keep this visible')
      await Promise.resolve()
    })

    await waitForCondition(
      () => mockState.sendMessageMock.mock.calls.length === 1,
      'in-flight send invocation'
    )

    await act(async () => {
      delete mockState.routeParams.threadId
      forceRerender?.()
      await Promise.resolve()
    })

    await act(async () => {
      mockState.routeParams.threadId = 'thread-1'
      forceRerender?.()
      await Promise.resolve()
    })

    await waitForCondition(
      () => mockState.listThreadChatMessagesMock.mock.calls.length === 2,
      're-entered thread history request'
    )

    expect(readMessageTexts(mockState.setMessagesMock.mock.lastCall?.[0])).toContain(
      'Please keep this visible'
    )

    await act(async () => {
      const resolveSend = mockState.sendResolvers.shift()
      resolveSend?.()
      await Promise.resolve()
    })
  })

  it('queues the first message until a newly selected thread finishes loading history', async () => {
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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')

    await act(async () => {
      await controller?.onSubmitMessage('Ship the first queued message')
    })

    expect(mockState.sendMessageMock).not.toHaveBeenCalled()

    await act(async () => {
      resolveHistory?.([])
      await Promise.resolve()
    })

    await waitForCondition(
      () => mockState.sendMessageMock.mock.calls.length === 1,
      'queued thread send'
    )
    expect(readMessageText(mockState.sendMessageMock.mock.calls[0]?.[0])).toBe(
      'Ship the first queued message'
    )
  })

  it('routes /stop through the main-thread command handler instead of sending chat', async () => {
    mockState.chatStatus = 'streaming'
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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')
    mockState.runThreadCommandMock.mockResolvedValueOnce({
      ok: true,
      handled: true,
      command: 'stop',
      stopped: true
    })
    mockState.stopMock.mockClear()

    await act(async () => {
      await controller?.onSubmitMessage('/stop')
    })

    expect(mockState.runThreadCommandMock).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'default-profile',
      text: '/stop'
    })
    expect(mockState.sendMessageMock).not.toHaveBeenCalled()
    expect(mockState.stopMock).not.toHaveBeenCalled()
  })

  it('routes toolbar abort through the main-thread command handler instead of useChat.stop', async () => {
    mockState.chatStatus = 'streaming'
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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')
    mockState.runThreadCommandMock.mockResolvedValueOnce({
      ok: true,
      handled: true,
      command: 'stop',
      stopped: true
    })
    mockState.stopMock.mockClear()

    await act(async () => {
      controller?.onAbortGeneration()
      await Promise.resolve()
    })

    expect(mockState.runThreadCommandMock).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'default-profile',
      text: '/stop'
    })
    expect(mockState.stopMock).not.toHaveBeenCalled()
  })

  it('routes /new through the main-thread command handler without sending chat', async () => {
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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')

    await act(async () => {
      await controller?.onSubmitMessage('/new')
    })

    expect(mockState.runThreadCommandMock).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'default-profile',
      text: '/new'
    })
    expect(mockState.createThreadMock).not.toHaveBeenCalled()
    expect(mockState.sendMessageMock).not.toHaveBeenCalled()
  })

  it('falls back to normal chat when the main-thread command parser does not handle a slash', async () => {
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
    mockState.runThreadCommandMock.mockResolvedValueOnce({
      ok: true,
      handled: false
    })
    mockState.sendMessageMock.mockResolvedValueOnce(undefined)

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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')

    await act(async () => {
      await controller?.onSubmitMessage('/unknown')
    })

    expect(mockState.runThreadCommandMock).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'default-profile',
      text: '/unknown'
    })
    expect(readMessageText(mockState.sendMessageMock.mock.calls[0]?.[0])).toBe('/unknown')
  })

  it('uses persisted thread usage totals as the canonical token usage state', async () => {
    mockState.routeParams.threadId = 'thread-1'
    const usageTotals = {
      assistantMessageCount: 2,
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      reasoningTokens: 9,
      cachedInputTokens: 18
    }
    const threadRecord = {
      id: 'thread-1',
      assistantId: 'assistant-1',
      resourceId: 'default-profile',
      title: 'Recovered thread',
      lastMessageAt: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      usageTotals
    }
    mockState.listThreadsMock.mockResolvedValue([threadRecord])
    mockState.threadsData = [threadRecord]

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

    await waitForCondition(() => controller?.selectedThread?.id === 'thread-1', 'selected thread')
    expect(controller?.tokenUsage).toEqual(usageTotals)

    const useChatOptions = mockState.useChatMock.mock.lastCall?.[0] as
      | {
          onFinish?: (input: {
            message: {
              metadata?: Record<string, unknown>
            }
          }) => void
        }
      | undefined

    await act(async () => {
      useChatOptions?.onFinish?.({
        message: {
          metadata: {
            usage: {
              inputTokens: 1,
              outputTokens: 2,
              totalTokens: 3
            }
          }
        }
      })
      await Promise.resolve()
    })

    expect(controller?.tokenUsage).toEqual(usageTotals)
  })

  it('refreshes token usage when thread records are updated from the server', async () => {
    mockState.routeParams.threadId = 'thread-1'
    const initialThreadRecord = {
      id: 'thread-1',
      assistantId: 'assistant-1',
      resourceId: 'default-profile',
      title: 'Recovered thread',
      lastMessageAt: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      usageTotals: {
        assistantMessageCount: 1,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        reasoningTokens: 0,
        cachedInputTokens: 0
      }
    }
    mockState.threadsData = [initialThreadRecord]

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

    await waitForCondition(() => controller?.tokenUsage?.totalTokens === 120, 'initial token usage')

    mockState.threadsData = [
      {
        ...initialThreadRecord,
        usageTotals: {
          assistantMessageCount: 2,
          inputTokens: 180,
          outputTokens: 55,
          totalTokens: 235,
          reasoningTokens: 10,
          cachedInputTokens: 25
        }
      }
    ]

    await act(async () => {
      forceRerender?.()
      await Promise.resolve()
    })

    await waitForCondition(() => controller?.tokenUsage?.totalTokens === 235, 'updated token usage')
    expect(controller?.tokenUsage).toEqual({
      assistantMessageCount: 2,
      inputTokens: 180,
      outputTokens: 55,
      totalTokens: 235,
      reasoningTokens: 10,
      cachedInputTokens: 25
    })
  })
})

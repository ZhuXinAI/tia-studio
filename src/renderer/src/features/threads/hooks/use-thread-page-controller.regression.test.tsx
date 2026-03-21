// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThreadPageController, type ThreadPageController } from './use-thread-page-controller'

const mockState = vi.hoisted(() => {
  const routeParams: { assistantId?: string; threadId?: string } = {}
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
    setMessagesCalls,
    assistantsData,
    providersData,
    emptyThreads,
    idleMutation,
    navigateMock: vi.fn(),
    getMcpServersSettingsMock: vi.fn(),
    updateAssistantHeartbeatMock: vi.fn(),
    clawsData: {
      claws: [],
      configuredChannels: []
    },
    updateClawMock: vi.fn(),
    createClawChannelMock: vi.fn(),
    updateClawChannelMock: vi.fn(),
    deleteClawChannelMock: vi.fn(),
    useChatMock: vi.fn()
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
  useCreateAssistant: () => mockState.idleMutation,
  useUpdateAssistant: () => mockState.idleMutation,
  useDeleteAssistant: () => mockState.idleMutation
}))

vi.mock('../../assistants/assistant-heartbeat-query', () => ({
  updateAssistantHeartbeat: () => mockState.updateAssistantHeartbeatMock()
}))

vi.mock('../../settings/providers/providers-query', () => ({
  useProviders: () => ({
    data: mockState.providersData,
    isLoading: false,
    error: null
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
    mockState.routeParams.assistantId = 'assistant-1'
    delete mockState.routeParams.threadId
    mockState.setMessagesCalls.splice(0, mockState.setMessagesCalls.length)

    mockState.navigateMock.mockReset()
    mockState.getMcpServersSettingsMock.mockReset()
    mockState.getMcpServersSettingsMock.mockImplementation(
      () => new Promise<Record<string, unknown>>(() => undefined)
    )
    mockState.updateAssistantHeartbeatMock.mockReset()
    mockState.clawsData = {
      claws: [],
      configuredChannels: []
    }
    mockState.updateClawMock.mockReset()
    mockState.createClawChannelMock.mockReset()
    mockState.updateClawChannelMock.mockReset()
    mockState.deleteClawChannelMock.mockReset()

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

  it('clears composer messages only once for assistant-only chat routes', async () => {
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

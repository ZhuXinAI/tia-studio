import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ThreadRecord } from '../threads-query'

const mockThreadMessages: UIMessage[] = []

const useAISDKRuntimeMock = vi.fn((chat: unknown, options?: unknown) => {
  void chat
  void options
  return { id: 'runtime' }
})

vi.mock('./thread-chat-message-list', () => ({
  ThreadChatMessageList: () => <div data-slot="thread-chat-message-list" />
}))

vi.mock('@renderer/components/assistant-ui/attachment', () => ({
  ComposerAddAttachment: () => <button data-slot="composer-add-attachment">Add</button>,
  ComposerAttachments: () => <div data-slot="composer-attachments" />
}))

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  useAISDKRuntime: (chat: unknown, options?: unknown) => useAISDKRuntimeMock(chat, options)
}))

vi.mock('@assistant-ui/react', () => {
  return {
    AssistantRuntimeProvider: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    ThreadPrimitive: {
      Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
    },
    ComposerPrimitive: {
      Root: ({ children }: { children?: React.ReactNode }) => <form>{children}</form>,
      Input: ({ minRows, ...props }: Record<string, unknown>) => (
        <textarea rows={typeof minRows === 'number' ? minRows : undefined} {...props} />
      ),
      Send: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) =>
        asChild ? <>{children}</> : <button type="submit">{children}</button>
    },
    useAui: () => ({
      composer: () => ({
        setText: () => undefined
      })
    }),
    useAuiState: (selector: (state: unknown) => unknown) =>
      selector({
        composer: {
          isEditing: true,
          text: ''
        },
        thread: {
          messages: mockThreadMessages
        }
      })
  }
})

import { ThreadChatCard } from './thread-chat-card'

function createAssistant(overrides?: Partial<AssistantRecord>): AssistantRecord {
  return {
    id: 'assistant-1',
    name: 'Planner',
    description: '',
    instructions: 'Keep plans concise.',
    enabled: true,
    origin: 'external-acp',
    studioFeaturesEnabled: false,
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/tmp/workspace' },
    skillsConfig: {},
    mcpConfig: {},
    maxSteps: 100,
    memoryConfig: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

function createThread(overrides?: Partial<ThreadRecord>): ThreadRecord {
  return {
    id: 'thread-1',
    assistantId: 'assistant-1',
    resourceId: 'default-profile',
    title: 'Thread title',
    lastMessageAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

function renderCard(overrides?: {
  selectedAssistant?: AssistantRecord | null
  selectedThread?: ThreadRecord | null
  isChatStreaming?: boolean
  canAbortGeneration?: boolean
  tokenUsage?: ThreadRecord['usageTotals']
}): string {
  const selectedAssistant = overrides?.selectedAssistant ?? createAssistant()
  const selectedThread = overrides?.selectedThread ?? createThread()

  return renderToString(
    <ThreadChatCard
      assistantOptions={
        selectedAssistant
          ? [
              {
                id: selectedAssistant.id,
                name: selectedAssistant.name,
                description: selectedAssistant.description,
                origin: selectedAssistant.origin
              }
            ]
          : []
      }
      selectedAssistant={selectedAssistant}
      selectedThread={selectedThread}
      chat={{} as UseChatHelpers<UIMessage>}
      readiness={{ canChat: true, checks: [] }}
      isLoadingChatHistory={false}
      isChatStreaming={overrides?.isChatStreaming ?? false}
      chatError={null}
      loadError={null}
      canAbortGeneration={overrides?.canAbortGeneration ?? false}
      supportsVision
      tokenUsage={overrides?.tokenUsage ?? null}
      onSubmitMessage={async () => undefined}
      onAbortGeneration={() => undefined}
      onSelectAssistant={() => undefined}
      onOpenAgentSettings={() => undefined}
    />
  )
}

describe('ThreadChatCard', () => {
  it('shows a built-in browser handoff banner when the browser handoff tool is waiting', () => {
    mockThreadMessages.length = 0
    mockThreadMessages.push({
      id: 'msg-assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-requestBrowserHumanHandoff',
          toolCallId: 'tool-handoff-1',
          state: 'input-available',
          input: {
            message: 'Finish signing in before the agent resumes.'
          }
        }
      ]
    })

    const html = renderCard({
      isChatStreaming: true,
      canAbortGeneration: true
    })

    expect(html).toContain('Human action needed in the built-in browser')
    expect(html).toContain('Finish signing in before the agent resumes.')
    expect(html).toContain('Show browser again')
  })

  it('renders the simplified workspace header with the selected assistant name', () => {
    mockThreadMessages.length = 0
    useAISDKRuntimeMock.mockClear()

    const html = renderCard()

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Planner')
    expect(html).toContain('Thread title')
    expect(html).toContain('Focused session with full thread history')
    expect(html).not.toContain('Heartbeat')
    expect(html).not.toContain('Configure')
  })

  it('shows a remote channel badge when the thread is bound to a channel chat', () => {
    mockThreadMessages.length = 0
    const html = renderCard({
      selectedThread: createThread({
        title: 'Channel thread',
        channelBinding: {
          channelId: 'channel-1',
          remoteChatId: 'chat-123',
          createdAt: '2026-03-01T00:00:00.000Z'
        }
      })
    })

    expect(html).toContain('Remote channel')
  })

  it('renders the persisted thread token total in the header', () => {
    mockThreadMessages.length = 0
    const html = renderCard({
      selectedThread: createThread({
        title: 'Usage thread',
        usageTotals: {
          assistantMessageCount: 2,
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          reasoningTokens: 9,
          cachedInputTokens: 18
        }
      }),
      tokenUsage: {
        assistantMessageCount: 2,
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        reasoningTokens: 9,
        cachedInputTokens: 18
      }
    })

    expect(html).toContain('data-testid="thread-token-usage"')
    expect(html).toContain('165')
    expect(html).toContain('tokens')
  })

  it('shows stop action while streaming a response', () => {
    mockThreadMessages.length = 0
    useAISDKRuntimeMock.mockClear()

    const html = renderCard({
      isChatStreaming: true,
      canAbortGeneration: true
    })

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Stop')
  })
})

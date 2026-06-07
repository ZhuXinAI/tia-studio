import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'

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

function createDefaultProps() {
  return {
    chatLabel: 'Chats',
    selectedWorkspace: {
      id: 'workspace-chats',
      name: 'Chats',
      rootPath: '/tmp/chats',
      builtInKind: 'chats' as const,
      defaultAssistantId: 'assistant-1',
      isMissing: false
    },
    workspaces: [
      {
        id: 'workspace-chats',
        name: 'Chats',
        rootPath: '/tmp/chats',
        builtInKind: 'chats' as const,
        defaultAssistantId: 'assistant-1',
        isMissing: false
      }
    ],
    providers: [
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai' as const,
        apiKey: 'secret',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5',
        providerModels: null,
        enabled: true,
        supportsVision: true,
        isBuiltIn: false,
        icon: null,
        officialSite: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ],
    isNewThreadRoute: false,
    draftProviderId: 'provider-1',
    draftModel: 'gpt-5',
    selectedAssistant: {
      id: 'assistant-1',
      name: 'Planner',
      description: '',
      instructions: 'Keep plans concise.',
      enabled: true,
      providerId: 'provider-1',
      workspaceConfig: { rootPath: '/tmp/workspace' },
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    },
    chat: {} as UseChatHelpers<UIMessage>,
    readiness: { canChat: true, checks: [] },
    isLoadingChatHistory: false,
    isChatStreaming: false,
    chatError: null,
    loadError: null,
    canAbortGeneration: false,
    supportsVision: true,
    tokenUsage: null,
    onSubmitMessage: async () => undefined,
    onAbortGeneration: () => undefined,
    onCreateThread: () => undefined,
    onSelectDraftWorkspace: () => undefined,
    onDraftProviderChange: () => undefined,
    onDraftModelChange: () => undefined,
    onRelocateWorkspace: () => undefined,
    onDeleteWorkspace: () => undefined,
    isRelocatingWorkspace: false,
    isDeletingWorkspace: false
  }
}

describe('ThreadChatCard', () => {
  it('keeps the header compact, single-line, and shows the selected assistant name', () => {
    mockThreadMessages.length = 0
    useAISDKRuntimeMock.mockClear()

    const html = renderToString(
      <ThreadChatCard
        {...createDefaultProps()}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Thread title',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }}
      />
    )

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('rounded-none border-0')
    expect(html).toContain('flex-nowrap items-center')
    expect(html).not.toContain('Conversation canvas')
    expect(html).toContain('Thread title')
    expect(html).toContain('font-editorial')
    expect(html).not.toContain('New thread')
  })

  it('does not render a title bar before the thread has a generated title', () => {
    mockThreadMessages.length = 0
    const html = renderToString(
      <ThreadChatCard
        {...createDefaultProps()}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: '',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }}
      />
    )

    expect(html).not.toContain('Untitled Thread')
    expect(html).not.toContain('Conversation canvas')
  })

  it('shows a remote channel badge when the thread is bound to a channel chat', () => {
    mockThreadMessages.length = 0
    const html = renderToString(
      <ThreadChatCard
        {...createDefaultProps()}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Channel thread',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          channelBinding: {
            channelId: 'channel-1',
            remoteChatId: 'chat-123',
            createdAt: '2026-03-01T00:00:00.000Z'
          }
        }}
      />
    )

    expect(html).toContain('Remote channel')
  })

  it('renders the persisted thread token totals in the header', () => {
    mockThreadMessages.length = 0
    const html = renderToString(
      <ThreadChatCard
        {...createDefaultProps()}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Usage thread',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          usageTotals: {
            assistantMessageCount: 2,
            inputTokens: 120,
            outputTokens: 45,
            totalTokens: 165,
            reasoningTokens: 9,
            cachedInputTokens: 18
          }
        }}
        tokenUsage={{
          assistantMessageCount: 2,
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          reasoningTokens: 9,
          cachedInputTokens: 18
        }}
      />
    )

    expect(html).toContain('data-testid="thread-token-usage"')
    expect(html).toContain('165')
    expect(html).toContain('120 in')
    expect(html).toContain('45 out')
  })

  it('shows stop action while streaming a response', () => {
    mockThreadMessages.length = 0
    useAISDKRuntimeMock.mockClear()

    const html = renderToString(
      <ThreadChatCard
        {...createDefaultProps()}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Thread title',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }}
        isChatStreaming={true}
        canAbortGeneration
      />
    )

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Stop')
    expect(html).not.toContain('Sending...')
  })
})

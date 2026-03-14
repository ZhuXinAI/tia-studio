import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'

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
        }
      })
  }
})

import { ThreadChatCard } from './thread-chat-card'

describe('ThreadChatCard', () => {
  it('keeps the header compact, single-line, and shows the selected assistant name', () => {
    useAISDKRuntimeMock.mockClear()

    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
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
        }}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Thread title',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }}
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{ canChat: true, checks: [] }}
        isLoadingChatHistory={false}
        isChatStreaming={false}
        chatError={null}
        loadError={null}
        canAbortGeneration={false}
        supportsVision
        tokenUsage={null}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('rounded-none border-t-0')
    expect(html).toContain('flex-nowrap items-center')
    expect(html).toContain('border-b border-border/70 py-2')
    expect(html).toContain('Planner assistant chat')
    expect(html).not.toContain('Default assistant chat')
    expect(html).not.toContain('Using Planner.')
  })

  it('shows a remote channel badge when the thread is bound to a channel chat', () => {
    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
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
        }}
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
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{ canChat: true, checks: [] }}
        isLoadingChatHistory={false}
        isChatStreaming={false}
        chatError={null}
        loadError={null}
        canAbortGeneration={false}
        supportsVision
        tokenUsage={null}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('Remote channel')
  })

  it('renders the persisted thread token totals in the header', () => {
    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
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
        }}
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
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{ canChat: true, checks: [] }}
        isLoadingChatHistory={false}
        isChatStreaming={false}
        chatError={null}
        loadError={null}
        canAbortGeneration={false}
        supportsVision
        tokenUsage={{
          assistantMessageCount: 2,
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          reasoningTokens: 9,
          cachedInputTokens: 18
        }}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('data-testid="thread-token-usage"')
    expect(html).toContain('165')
    expect(html).toContain('120 in')
    expect(html).toContain('45 out')
  })

  it('shows stop action while streaming a response', () => {
    useAISDKRuntimeMock.mockClear()

    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
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
        }}
        selectedThread={{
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Thread title',
          lastMessageAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }}
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{ canChat: true, checks: [] }}
        isLoadingChatHistory={false}
        isChatStreaming={true}
        chatError={null}
        loadError={null}
        canAbortGeneration
        supportsVision
        tokenUsage={null}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Stop')
    expect(html).not.toContain('Sending...')
  })
})

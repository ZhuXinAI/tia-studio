import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'

vi.mock('./thread-chat-message-list', () => ({
  ThreadChatMessageList: () => <div data-slot="thread-chat-message-list" />
}))

import { ThreadChatCard } from './thread-chat-card'

describe('ThreadChatCard', () => {
  it('keeps the header compact, single-line, and shows assistant-specific status chip', () => {
    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
          id: 'assistant-1',
          name: 'Planner',
          instructions: 'Keep plans concise.',
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
        composerValue=""
        canSendMessage
        canAbortGeneration={false}
        onComposerChange={() => undefined}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('rounded-none border-t-0')
    expect(html).toContain('flex-nowrap items-center')
    expect(html).toContain('border-b border-border/70 py-2')
    expect(html).toContain('Planner chat')
    expect(html).not.toContain('Using Planner.')
    expect(html).toContain('aria-label="New thread"')
    expect(html).toContain('aria-label="Voice input"')
    expect(html).toContain('aria-label="Attachments"')
  })

  it('shows stop action while streaming a response', () => {
    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
          id: 'assistant-1',
          name: 'Planner',
          instructions: 'Keep plans concise.',
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
        composerValue=""
        canSendMessage={false}
        canAbortGeneration
        onComposerChange={() => undefined}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('Stop')
    expect(html).not.toContain('Sending...')
  })

  it('shows toolbar action buttons when no thread is selected', () => {
    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
          id: 'assistant-1',
          name: 'Planner',
          instructions: 'Keep plans concise.',
          providerId: 'provider-1',
          workspaceConfig: { rootPath: '/tmp/workspace' },
          skillsConfig: {},
          mcpConfig: {},
          maxSteps: 100,
          memoryConfig: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }}
        selectedThread={null}
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{ canChat: true, checks: [] }}
        isLoadingChatHistory={false}
        isChatStreaming={false}
        chatError={null}
        loadError={null}
        composerValue=""
        canSendMessage
        canAbortGeneration={false}
        onComposerChange={() => undefined}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('aria-label="New thread"')
    expect(html).toContain('aria-label="Voice input"')
    expect(html).toContain('aria-label="Attachments"')
  })

  it('shows fallback thread title when current title is empty', () => {
    const html = renderToString(
      <ThreadChatCard
        selectedAssistant={{
          id: 'assistant-1',
          name: 'Planner',
          instructions: 'Keep plans concise.',
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
          title: '',
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
        composerValue=""
        canSendMessage
        canAbortGeneration={false}
        onComposerChange={() => undefined}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenAssistantConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('Untitled Thread')
  })
})

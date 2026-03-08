import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'

const useAISDKRuntimeMock = vi.fn((chat: unknown, options?: unknown) => {
  void chat
  void options
  return { id: 'runtime' }
})

vi.mock('../../threads/components/thread-chat-message-list', () => ({
  ThreadChatMessageList: () => <div data-slot="thread-chat-message-list" />
}))

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  useAISDKRuntime: (chat: unknown, options?: unknown) => useAISDKRuntimeMock(chat, options)
}))

vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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
}))

import { TeamChatCard } from './team-chat-card'

describe('TeamChatCard', () => {
  it('renders the team workspace metadata and shows the setup blocker when incomplete', () => {
    useAISDKRuntimeMock.mockClear()

    const html = renderToString(
      <TeamChatCard
        selectedWorkspace={{
          id: 'workspace-1',
          name: 'Docs Workspace',
          rootPath: '/Users/demo/project',
          teamDescription: '',
          supervisorProviderId: null,
          supervisorModel: '',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }}
        selectedThread={{
          id: 'thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release Team',
          teamDescription: '',
          supervisorProviderId: null,
          supervisorModel: '',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }}
        selectedMembers={[]}
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{
          canChat: false,
          checks: [
            {
              id: 'members',
              label: 'At least one live team member is selected',
              ready: false
            }
          ]
        }}
        isLoadingChatHistory={false}
        isChatStreaming={false}
        chatError={null}
        loadError={null}
        canAbortGeneration={false}
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenTeamConfig={() => undefined}
        onOpenStatusDialog={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Docs Workspace')
    expect(html).toContain('Configure Team')
    expect(html).toContain('Team setup is incomplete.')
    expect(html).toContain('Open Team Status')
  })

  it('shows stop while team chat is streaming', () => {
    useAISDKRuntimeMock.mockClear()

    const html = renderToString(
      <TeamChatCard
        selectedWorkspace={{
          id: 'workspace-1',
          name: 'Docs Workspace',
          rootPath: '/Users/demo/project',
          teamDescription: '',
          supervisorProviderId: 'provider-1',
          supervisorModel: 'gpt-5',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }}
        selectedThread={{
          id: 'thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release Team',
          teamDescription: '',
          supervisorProviderId: 'provider-1',
          supervisorModel: 'gpt-5',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }}
        selectedMembers={[
          {
            id: 'assistant-1',
            name: 'Planner',
            description: '',
            instructions: '',
            enabled: true,
            providerId: 'provider-1',
            workspaceConfig: {},
            skillsConfig: {},
            mcpConfig: {},
            maxSteps: 100,
            memoryConfig: null,
            createdAt: '2026-03-07T00:00:00.000Z',
            updatedAt: '2026-03-07T00:00:00.000Z'
          }
        ]}
        chat={{} as UseChatHelpers<UIMessage>}
        readiness={{ canChat: true, checks: [] }}
        isLoadingChatHistory={false}
        isChatStreaming
        chatError={null}
        loadError={null}
        canAbortGeneration
        onSubmitMessage={async () => undefined}
        onAbortGeneration={() => undefined}
        onOpenTeamConfig={() => undefined}
        onOpenStatusDialog={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Stop')
  })
})

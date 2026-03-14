import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { GroupChatCard } from './group-chat-card'

describe('GroupChatCard', () => {
  it('shows assistant author labels and a typing indicator', () => {
    const html = renderToString(
      <GroupChatCard
        selectedGroup={{
          id: 'group-1',
          name: 'Launch Group',
          rootPath: '/Users/demo/project',
          groupDescription: 'Plan the launch.',
          maxAutoTurns: 6,
          createdAt: '2026-03-13T00:00:00.000Z',
          updatedAt: '2026-03-13T00:00:00.000Z'
        }}
        selectedThread={{
          id: 'thread-1',
          groupId: 'group-1',
          resourceId: 'default-profile',
          title: 'Launch Room',
          lastMessageAt: null,
          createdAt: '2026-03-13T00:00:00.000Z',
          updatedAt: '2026-03-13T00:00:00.000Z'
        }}
        messages={[
          {
            id: 'msg-1',
            threadId: 'thread-1',
            role: 'assistant',
            authorType: 'assistant',
            authorId: 'assistant-1',
            authorName: 'Planner',
            content: 'I can outline the rollout.',
            mentions: [],
            createdAt: '2026-03-13T00:00:00.000Z'
          }
        ]}
        members={[
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
            createdAt: '2026-03-13T00:00:00.000Z',
            updatedAt: '2026-03-13T00:00:00.000Z'
          }
        ]}
        readiness={{
          canChat: true,
          checks: []
        }}
        isLoadingMessages={false}
        isSubmittingMessage={false}
        isAgentTyping
        activeSpeakerName="Researcher"
        loadError={null}
        onSubmitMessage={async () => undefined}
        onOpenConfig={() => undefined}
        onCreateThread={() => undefined}
      />
    )

    expect(html).toContain('Planner')
    expect(html).toContain('Researcher is thinking...')
    expect(html).toContain('Edit Group')
  })
})

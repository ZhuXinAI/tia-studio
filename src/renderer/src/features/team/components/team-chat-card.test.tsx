// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  }
}))

import { TeamChatCard } from './team-chat-card'

function setTextareaValue(element: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )

  if (!button) {
    throw new Error(`Could not find button with text: ${text}`)
  }

  return button
}

function buildWorkspace() {
  return {
    id: 'workspace-1',
    name: 'Docs Workspace',
    rootPath: '/Users/demo/project',
    teamDescription: '',
    supervisorProviderId: 'provider-1',
    supervisorModel: 'gpt-5',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z'
  }
}

function buildThread() {
  return {
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
  }
}

function buildMember(name = 'Planner') {
  return {
    id: `assistant-${name.toLowerCase()}`,
    name,
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
}

describe('TeamChatCard', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useAISDKRuntimeMock.mockClear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('renders the team workspace metadata and shows the setup blocker when incomplete', async () => {
    await act(async () => {
      root.render(
        <TeamChatCard
          selectedWorkspace={buildWorkspace()}
          selectedThread={{
            ...buildThread(),
            supervisorProviderId: null,
            supervisorModel: ''
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
    })

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Docs Workspace')
    expect(container.textContent).toContain('Configure Team')
    expect(container.textContent).toContain('Team setup is incomplete.')
    expect(container.textContent).toContain('Open Team Status')
  })

  it('shows stop while team chat is streaming', async () => {
    await act(async () => {
      root.render(
        <TeamChatCard
          selectedWorkspace={buildWorkspace()}
          selectedThread={buildThread()}
          selectedMembers={[buildMember()]}
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
    })

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Stop')
  })

  it('submits mention-rich plain text from the team composer', async () => {
    const onSubmitMessage = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <TeamChatCard
          selectedWorkspace={buildWorkspace()}
          selectedThread={buildThread()}
          selectedMembers={[buildMember('Planner'), buildMember('Researcher')]}
          chat={{} as UseChatHelpers<UIMessage>}
          readiness={{ canChat: true, checks: [] }}
          isLoadingChatHistory={false}
          isChatStreaming={false}
          chatError={null}
          loadError={null}
          canAbortGeneration={false}
          onSubmitMessage={onSubmitMessage}
          onAbortGeneration={() => undefined}
          onOpenTeamConfig={() => undefined}
          onOpenStatusDialog={() => undefined}
          onCreateThread={() => undefined}
        />
      )
    })

    expect(container.querySelector('.team-chat-mentions')).not.toBeNull()

    const composer = container.querySelector('textarea')
    expect(composer).not.toBeNull()

    await act(async () => {
      setTextareaValue(composer as HTMLTextAreaElement, 'Route this to @Planner')
    })

    const sendButton = findButtonByText(container, 'Send')
    expect(sendButton.disabled).toBe(false)

    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmitMessage).toHaveBeenCalledWith('Route this to @Planner')
    expect((composer as HTMLTextAreaElement).value).toBe('')
  })

  it('allows sending without a preselected thread when the team is otherwise ready', async () => {
    const onSubmitMessage = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <TeamChatCard
          selectedWorkspace={buildWorkspace()}
          selectedThread={null}
          selectedMembers={[buildMember('Planner')]}
          chat={{} as UseChatHelpers<UIMessage>}
          readiness={{ canChat: true, checks: [] }}
          isLoadingChatHistory={false}
          isChatStreaming={false}
          chatError={null}
          loadError={null}
          canAbortGeneration={false}
          onSubmitMessage={onSubmitMessage}
          onAbortGeneration={() => undefined}
          onOpenTeamConfig={() => undefined}
          onOpenStatusDialog={() => undefined}
          onCreateThread={() => undefined}
        />
      )
    })

    const composer = container.querySelector('textarea')
    expect(composer).not.toBeNull()

    await act(async () => {
      setTextareaValue(composer as HTMLTextAreaElement, 'Kick off a fresh team thread')
    })

    const sendButton = findButtonByText(container, 'Send')
    expect(sendButton.disabled).toBe(false)

    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmitMessage).toHaveBeenCalledWith('Kick off a fresh team thread')
    expect((composer as HTMLTextAreaElement).value).toBe('')
  })
})

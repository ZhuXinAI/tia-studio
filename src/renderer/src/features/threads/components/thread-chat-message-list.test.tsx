// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadChatMessageList } from './thread-chat-message-list'

const threadMessagesComponentsMock = vi.fn((components: unknown) => {
  void components
})
const actionBarRootPropsMock = vi.fn((props: unknown) => {
  void props
})
const actionBarMoreRootPropsMock = vi.fn((props: unknown) => {
  void props
})
const messageState = {
  message: {
    createdAt: new Date('2026-03-01T12:34:00.000Z'),
    isHovering: true
  }
}

vi.mock('@renderer/components/assistant-ui/attachment', () => ({
  UserMessageAttachments: () => <div data-testid="user-message-attachments" />
}))

vi.mock('@assistant-ui/react', () => {
  const Root = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  const Viewport = ({
    children,
    className
  }: {
    children?: React.ReactNode
    className?: string
  }): React.JSX.Element => (
    <div data-testid="thread-viewport" data-class-name={className}>
      {children}
    </div>
  )
  const Empty = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )

  return {
    AuiIf: ({
      children,
      condition
    }: {
      children?: React.ReactNode
      condition: (state: typeof messageState) => boolean
    }) => (condition(messageState) ? <>{children}</> : null),
    useAuiState: <T,>(selector: (state: typeof messageState) => T): T => selector(messageState),
    ActionBarPrimitive: {
      Root: (props: { children?: React.ReactNode; autohide?: string }) => {
        actionBarRootPropsMock(props)
        return <div>{props.children}</div>
      },
      Copy: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Reload: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      ExportMarkdown: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
    },
    ActionBarMorePrimitive: {
      Root: (props: {
        children?: React.ReactNode
        open?: boolean
        onOpenChange?: (open: boolean) => void
      }) => {
        actionBarMoreRootPropsMock(props)
        return <div>{props.children}</div>
      },
      Trigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Content: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Separator: () => <div />
    },
    MessagePartPrimitive: {
      Text: ({ className }: { className?: string }) => <div data-class-name={className} />
    },
    MessagePrimitive: {
      Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Parts: () => null
    },
    ThreadPrimitive: {
      Root,
      Viewport,
      Empty,
      Messages: ({
        components
      }: {
        components: { AssistantMessage?: React.FC; UserMessage?: React.FC }
      }) => {
        threadMessagesComponentsMock(components)
        const AssistantMessage = components.AssistantMessage
        const UserMessage = components.UserMessage
        return (
          <div>
            {UserMessage ? <UserMessage /> : null}
            {AssistantMessage ? <AssistantMessage /> : null}
          </div>
        )
      }
    }
  }
})

describe('thread chat message list', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    threadMessagesComponentsMock.mockClear()
    actionBarRootPropsMock.mockClear()
    actionBarMoreRootPropsMock.mockClear()
    messageState.message.createdAt = new Date('2026-03-01T12:34:00.000Z')
    messageState.message.isHovering = true
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('renders overflow actions trigger for assistant messages', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(container.querySelector('[aria-label="More actions"]')).not.toBeNull()
  })

  it('keeps assistant message component stable between rerenders', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const firstComponents = threadMessagesComponentsMock.mock.calls[0]?.[0] as
      | { AssistantMessage?: unknown }
      | undefined
    expect(firstComponents?.AssistantMessage).toBeDefined()

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={true}
          loadError={null}
          chatError={null}
        />
      )
    })

    const secondComponents = threadMessagesComponentsMock.mock.calls[1]?.[0] as
      | { AssistantMessage?: unknown }
      | undefined
    expect(secondComponents?.AssistantMessage).toBe(firstComponents?.AssistantMessage)
  })

  it('applies custom scrollbar styling to the thread viewport', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const viewport = container.querySelector('[data-testid="thread-viewport"]')
    expect(viewport?.getAttribute('data-class-name')).toContain('chat-scrollbar')
  })

  it('pins message actions so they stay visible', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const initialActionBarProps = actionBarRootPropsMock.mock.lastCall?.[0] as
      | { autohide?: string }
      | undefined
    expect(initialActionBarProps?.autohide).toBe('never')
    expect(actionBarMoreRootPropsMock).toHaveBeenCalled()
  })

  it('shows message timestamp when message is hovered', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const timestamps = Array.from(container.querySelectorAll('[data-testid="message-timestamp"]'))
    expect(timestamps.length).toBeGreaterThan(0)
    for (const timestamp of timestamps) {
      expect(timestamp.className).not.toContain('invisible')
      expect(timestamp.textContent).toBeTruthy()
    }
  })

  it('keeps timestamp visible when message is not hovered', async () => {
    messageState.message.isHovering = false

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const timestamps = Array.from(container.querySelectorAll('[data-testid="message-timestamp"]'))
    expect(timestamps.length).toBeGreaterThan(0)
    for (const timestamp of timestamps) {
      expect(timestamp.className).not.toContain('invisible')
    }
  })
})

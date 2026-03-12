// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadChatMessageList } from './thread-chat-message-list'

const threadMessagesComponentsMock = vi.fn((components: unknown) => {
  void components
})
const virtuosoPropsMock = vi.fn((props: unknown) => {
  void props
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
  },
  thread: {
    messages: [{}, {}]
  }
}

vi.mock('@renderer/components/assistant-ui/attachment', () => ({
  UserMessageAttachments: () => <div data-testid="user-message-attachments" />
}))

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    className,
    data = [],
    itemContent,
    components,
    initialTopMostItemIndex,
    alignToBottom,
    followOutput
  }: {
    className?: string
    data?: Array<unknown>
    itemContent?: (index: number, item: unknown) => React.ReactNode
    components?: {
      EmptyPlaceholder?: React.ComponentType
      Footer?: React.ComponentType
    }
    initialTopMostItemIndex?: unknown
    alignToBottom?: boolean
    followOutput?: unknown
  }) => {
    virtuosoPropsMock({
      initialTopMostItemIndex,
      alignToBottom,
      followOutput,
      className
    })

    const EmptyPlaceholder = components?.EmptyPlaceholder
    const Footer = components?.Footer

    return (
      <div data-testid="thread-viewport" data-class-name={className}>
        {data.length === 0 ? (
          EmptyPlaceholder ? (
            <EmptyPlaceholder />
          ) : null
        ) : (
          data.map((item, index) => (
            <div key={index}>{itemContent ? itemContent(index, item) : null}</div>
          ))
        )}
        {Footer ? <Footer /> : null}
      </div>
    )
  }
}))

vi.mock('@assistant-ui/react', () => {
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
      MessageByIndex: ({
        index,
        components
      }: {
        index: number
        components: { AssistantMessage?: React.FC; UserMessage?: React.FC }
      }) => {
        if (index === 0) {
          threadMessagesComponentsMock(components)
        }
        const AssistantMessage = components.AssistantMessage
        const UserMessage = components.UserMessage
        if (index % 2 === 0) {
          return UserMessage ? <UserMessage /> : null
        }
        return AssistantMessage ? <AssistantMessage /> : null
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
    virtuosoPropsMock.mockClear()
    actionBarRootPropsMock.mockClear()
    actionBarMoreRootPropsMock.mockClear()
    messageState.message.createdAt = new Date('2026-03-01T12:34:00.000Z')
    messageState.message.isHovering = true
    messageState.thread.messages = [{}, {}]
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
          threadId="thread-1"
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
          threadId="thread-1"
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
          threadId="thread-1"
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
          threadId="thread-1"
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

  it('configures virtuoso to start from the latest message and align short threads to bottom', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const virtuosoProps = virtuosoPropsMock.mock.lastCall?.[0] as
      | {
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
          alignToBottom?: boolean
          followOutput?: (isAtBottom: boolean) => string | boolean
        }
      | undefined

    expect(virtuosoProps?.initialTopMostItemIndex).toEqual({ index: 'LAST', align: 'end' })
    expect(virtuosoProps?.alignToBottom).toBe(true)
    expect(virtuosoProps?.followOutput?.(true)).toBe('auto')
    expect(virtuosoProps?.followOutput?.(false)).toBe(false)
  })

  it('keeps the initial virtuoso location stable after message count changes', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    messageState.thread.messages = [{}, {}, {}]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={true}
          loadError={null}
          chatError={null}
        />
      )
    })

    const virtuosoProps = virtuosoPropsMock.mock.lastCall?.[0] as
      | {
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(virtuosoProps?.initialTopMostItemIndex).toEqual({ index: 'LAST', align: 'end' })
  })

  it('remounts virtuoso when the first messages arrive after an empty mount', async () => {
    messageState.thread.messages = []

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const firstCall = virtuosoPropsMock.mock.lastCall?.[0] as
      | {
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(firstCall?.initialTopMostItemIndex).toBeUndefined()

    messageState.thread.messages = [{}, {}]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const secondCall = virtuosoPropsMock.mock.lastCall?.[0] as
      | {
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(secondCall?.initialTopMostItemIndex).toEqual({ index: 'LAST', align: 'end' })
  })

  it('remounts virtuoso without an initial index when history is cleared', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const firstCall = virtuosoPropsMock.mock.lastCall?.[0] as
      | {
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(firstCall?.initialTopMostItemIndex).toEqual({ index: 'LAST', align: 'end' })

    messageState.thread.messages = []

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    const secondCall = virtuosoPropsMock.mock.lastCall?.[0] as
      | {
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(secondCall?.initialTopMostItemIndex).toBeUndefined()
    expect(container.querySelector('[data-testid="thread-viewport"]')).not.toBeNull()
  })

  it('pins message actions so they stay visible', async () => {
    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
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
          threadId="thread-1"
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
          threadId="thread-1"
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

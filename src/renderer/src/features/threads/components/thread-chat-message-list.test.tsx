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
const messagePartsPropsMock = vi.fn((props: unknown) => {
  void props
})
const messageState = {
  message: {
    createdAt: new Date('2026-03-01T12:34:00.000Z'),
    isHovering: true,
    metadata: null as Record<string, unknown> | null,
    parts: [] as unknown[]
  },
  thread: {
    messages: [{}, {}]
  }
}

vi.mock('@renderer/components/assistant-ui/attachment', () => ({
  UserMessageAttachments: () => <div data-testid="user-message-attachments" />
}))

vi.mock('react-virtuoso', () => ({
  Virtuoso: (props: {
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
    const {
      className,
      data = [],
      itemContent,
      components,
      initialTopMostItemIndex,
      alignToBottom,
      followOutput
    } = props

    virtuosoPropsMock({
      hasInitialTopMostItemIndexProp: Object.prototype.hasOwnProperty.call(
        props,
        'initialTopMostItemIndex'
      ),
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
      Parts: (props: unknown) => {
        messagePartsPropsMock(props)
        return null
      }
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
    messagePartsPropsMock.mockClear()
    messageState.message.createdAt = new Date('2026-03-01T12:34:00.000Z')
    messageState.message.isHovering = true
    messageState.message.metadata = null
    messageState.message.parts = []
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

  it('registers a delegated tool-agent data renderer for nested member streams', async () => {
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

    const partsCalls = messagePartsPropsMock.mock.calls
      .map((call) => call[0] as { components?: Record<string, unknown> } | undefined)
      .filter(Boolean)
    const assistantParts = partsCalls.find((call) => {
      const components = call?.components as { tools?: unknown } | undefined
      return Boolean(components?.tools)
    })
    const dataConfig = assistantParts?.components?.['data'] as
      | {
          by_name?: Record<string, unknown>
        }
      | undefined

    expect(dataConfig?.by_name?.['tool-agent']).toBeTypeOf('function')
  })

  it('renders team turns as delegated member blocks and hides supervisor summary text', async () => {
    messageState.message.parts = [
      {
        type: 'text',
        text: 'Should I ask Planner if they want another round?'
      },
      {
        type: 'tool-call',
        toolName: 'delegate_to_researcher_1',
        toolCallId: 'tool-1',
        status: { type: 'complete' },
        result: {
          kind: 'team-member-result',
          assistantId: 'assistant-1',
          assistantName: 'Researcher',
          task: 'Check the factual risks',
          text: 'I verified the facts and flagged the unsupported claims.',
          mentions: ['assistant-2'],
          mentionNames: ['Planner'],
          subAgentThreadId: 'sub-thread-1',
          subAgentResourceId: 'sub-resource-1'
        }
      }
    ]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Team Supervisor"
          assistantMessageVariant="team"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(container.textContent).toContain('Researcher')
    expect(container.textContent).toContain(
      'I verified the facts and flagged the unsupported claims.'
    )
    expect(container.textContent).toContain('Suggested next: Planner')
    expect(container.textContent).not.toContain('Should I ask Planner if they want another round?')
  })

  it('renders running delegated streams as agent-authored team blocks', async () => {
    messageState.message.parts = [
      {
        type: 'tool-call',
        toolName: 'delegate_to_researcher_1',
        toolCallId: 'tool-1',
        status: { type: 'running' }
      },
      {
        type: 'data',
        name: 'tool-agent',
        data: {
          text: 'Gathering sources for the release note.',
          status: 'running',
          toolCalls: [
            {
              payload: {
                toolCallId: 'search-1',
                toolName: 'web_search'
              }
            }
          ],
          toolResults: []
        }
      }
    ]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Team Supervisor"
          assistantMessageVariant="team"
          isLoadingChatHistory={false}
          isChatStreaming={true}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(container.textContent).toContain('Researcher')
    expect(container.textContent).toContain('Gathering sources for the release note.')
    expect(container.textContent).toContain('Tools')
    expect(container.textContent).toContain('Web Search')
  })

  it('keeps the live delegated stream attached to the unfinished member block', async () => {
    messageState.message.parts = [
      {
        type: 'tool-call',
        toolName: 'delegate_to_gmnt_1',
        toolCallId: 'tool-1',
        status: { type: 'complete' },
        result: {
          kind: 'team-member-result',
          assistantId: 'assistant-1',
          assistantName: 'GMNT',
          task: 'Investigate the issue',
          text: 'I traced the first half of the issue and handed off follow-up.',
          mentions: ['assistant-2'],
          mentionNames: ['Kimi'],
          subAgentThreadId: 'sub-thread-1',
          subAgentResourceId: 'sub-resource-1'
        }
      },
      {
        type: 'tool-call',
        toolName: 'delegate_to_kimi_2',
        toolCallId: 'tool-2',
        status: { type: 'running' }
      },
      {
        type: 'data',
        name: 'tool-agent',
        data: {
          text: 'I am continuing the handoff by checking the rendering path.',
          status: 'running',
          toolCalls: [],
          toolResults: []
        }
      }
    ]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Team Supervisor"
          assistantMessageVariant="team"
          isLoadingChatHistory={false}
          isChatStreaming={true}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(container.textContent).toContain(
      'I traced the first half of the issue and handed off follow-up.'
    )
    expect(container.textContent).toContain('Kimi')
    expect(container.textContent).toContain(
      'I am continuing the handoff by checking the rendering path.'
    )
  })

  it('shows truncated delegation errors in team mode instead of a hanging working state', async () => {
    messageState.message.parts = [
      {
        type: 'tool-call',
        toolName: 'delegate_to_planner_1',
        toolCallId: 'tool-1',
        status: {
          type: 'incomplete',
          error: {
            message:
              'Provider quota limit exceeded while fetching delegated model output for Planner.'
          }
        }
      }
    ]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Team Supervisor"
          assistantMessageVariant="team"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(container.textContent).toContain('Planner')
    expect(container.textContent).toContain('Provider quota limit exceeded while fetching de...')
    expect(container.textContent).not.toContain('Working...')
    expect(container.textContent).not.toContain(
      'Provider quota limit exceeded while fetching delegated model output for Planner.'
    )
  })

  it('hides completion-only supervisor turns in team mode', async () => {
    messageState.message.parts = [
      {
        type: 'text',
        text: 'All set, I will summarize this myself.'
      },
      {
        type: 'tool-call',
        toolName: 'complete',
        toolCallId: 'tool-complete-1',
        status: { type: 'complete' },
        result: {
          kind: 'team-complete',
          status: 'complete',
          summary: 'The delegated work is complete.'
        }
      }
    ]

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          threadId="thread-1"
          assistantName="Team Supervisor"
          assistantMessageVariant="team"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(container.textContent).not.toContain('All set, I will summarize this myself.')
    expect(container.textContent).not.toContain('Team Supervisor')
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
          hasInitialTopMostItemIndexProp?: boolean
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
          alignToBottom?: boolean
          followOutput?: (isAtBottom: boolean) => string | boolean
        }
      | undefined

    expect(virtuosoProps?.hasInitialTopMostItemIndexProp).toBe(true)
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
          hasInitialTopMostItemIndexProp?: boolean
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(firstCall?.hasInitialTopMostItemIndexProp).toBe(false)
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
          hasInitialTopMostItemIndexProp?: boolean
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(secondCall?.hasInitialTopMostItemIndexProp).toBe(true)
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
          hasInitialTopMostItemIndexProp?: boolean
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(firstCall?.hasInitialTopMostItemIndexProp).toBe(true)
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
          hasInitialTopMostItemIndexProp?: boolean
          initialTopMostItemIndex?: { index: 'LAST' | number; align: string }
        }
      | undefined

    expect(secondCall?.hasInitialTopMostItemIndexProp).toBe(false)
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

  it('shows token usage details when hovering a message with usage metadata', async () => {
    messageState.message.metadata = {
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
        reasoningTokens: 12,
        cachedInputTokens: 30
      }
    }

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

    const usageLines = Array.from(container.querySelectorAll('[data-testid="message-usage"]'))
    expect(usageLines.length).toBeGreaterThan(0)
    expect(usageLines[0]?.textContent).toContain('160')
    expect(usageLines[0]?.textContent).toContain('120')
    expect(usageLines[0]?.textContent).toContain('40')
    expect(usageLines[0]?.textContent).toContain('12 reasoning')
    expect(usageLines[0]?.textContent).toContain('30 cached')
  })

  it('hides token usage details when the message is not hovered', async () => {
    messageState.message.isHovering = false
    messageState.message.metadata = {
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160
      }
    }

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

    expect(container.querySelector('[data-testid="message-usage"]')).toBeNull()
  })
})

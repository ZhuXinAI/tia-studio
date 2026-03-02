// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { UseChatHelpers } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadChatMessageList } from './thread-chat-message-list'

const useAISDKRuntimeMock = vi.fn((chat: unknown) => {
  void chat
  return { id: 'runtime' }
})

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  useAISDKRuntime: (chat: unknown) => useAISDKRuntimeMock(chat)
}))

vi.mock('@assistant-ui/react', () => {
  const Root = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  const Viewport = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  const Empty = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )

  return {
    AssistantRuntimeProvider: ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
      <div>{children}</div>
    ),
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
      Messages: () => null
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

  it('creates assistant-ui runtime from ai sdk chat helpers', async () => {
    const chat = {
      messages: [],
      status: 'ready',
      error: null
    } as unknown as UseChatHelpers<UIMessage>

    await act(async () => {
      root.render(
        <ThreadChatMessageList
          chat={chat}
          assistantName="Planner"
          isLoadingChatHistory={false}
          isChatStreaming={false}
          loadError={null}
          chatError={null}
        />
      )
    })

    expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
    expect(useAISDKRuntimeMock).toHaveBeenCalledWith(chat)
  })
})

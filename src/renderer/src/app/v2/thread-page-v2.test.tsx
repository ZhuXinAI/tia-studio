// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadPageV2 } from './thread-page-v2'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn()
}))

vi.mock('../../features/threads/agent-sessions-query', () => ({
  agentSessionKeys: { all: ['agent-sessions'], detail: (id: string) => ['agent-sessions', id] },
  respondToAgentInteraction: vi.fn(),
  setAgentAccessMode: vi.fn(),
  setAgentModel: vi.fn(),
  useAgentMessages: () => ({ data: [], isLoading: false }),
  useAgentSession: () => ({ data: undefined, isLoading: false, error: null }),
  useCreateAgentSession: () => ({ mutateAsync: mocks.createSession })
}))

vi.mock('../../features/settings/providers/providers-query', () => ({
  useProviders: () => ({
    data: [
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai',
        selectedModel: 'gpt-5',
        enabled: true,
        isDefault: true
      }
    ],
    isLoading: false
  })
}))

vi.mock('../../features/workspaces/workspaces-query', () => ({
  useWorkspaces: () => ({
    data: [{ id: 'chats', rootPath: '/tmp/chats', builtInKind: 'chats' }],
    isLoading: false
  })
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ThreadPageV2 startup', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.createSession.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('replaces the indefinite loading state with an error and permits retry', async () => {
    mocks.createSession.mockRejectedValue(new Error('Pi model is unavailable'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/chat']}>
            <Routes>
              <Route path="/chat" element={<ThreadPageV2 />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })
    await flush()

    expect(container.textContent).toContain('Pi could not start')
    expect(container.textContent).toContain('Pi model is unavailable')
    expect(container.textContent).not.toContain('Starting Pi…')

    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Try again'
    )
    await act(async () => retry?.click())
    await flush()

    expect(mocks.createSession).toHaveBeenCalledTimes(2)
  })
})

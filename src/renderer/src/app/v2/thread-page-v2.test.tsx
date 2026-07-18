// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
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
    data: [
      { id: 'chats', rootPath: '/tmp/chats', builtInKind: 'chats' },
      { id: 'workspace-1', rootPath: '/tmp/workspace-1', builtInKind: null }
    ],
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
          <MemoryRouter initialEntries={['/chat/new']}>
            <Routes>
              <Route path="/chat/new" element={<ThreadPageV2 />} />
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

  it('starts sessions only from explicit new-thread routes', async () => {
    mocks.createSession.mockResolvedValueOnce({ id: 'chat-1', workspaceId: null })
    mocks.createSession.mockResolvedValueOnce({
      id: 'workspace-thread-1',
      workspaceId: 'workspace-1'
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })

    function Layout(): React.JSX.Element {
      return (
        <>
          <Link to="/workspaces/workspace-1/new">New workspace thread</Link>
          <Outlet />
        </>
      )
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/chat/new']}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/chat" element={<ThreadPageV2 />} />
                <Route path="/chat/new" element={<ThreadPageV2 />} />
                <Route path="/chat/:threadId" element={<ThreadPageV2 />} />
                <Route path="/workspaces/:workspaceId" element={<ThreadPageV2 />} />
                <Route path="/workspaces/:workspaceId/new" element={<ThreadPageV2 />} />
                <Route
                  path="/workspaces/:workspaceId/threads/:threadId"
                  element={<ThreadPageV2 />}
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })
    await flush()
    expect(mocks.createSession).toHaveBeenCalledTimes(1)

    const workspaceLink = Array.from(container.querySelectorAll('a')).find(
      (link) => link.textContent === 'New workspace thread'
    )
    await act(async () => workspaceLink?.click())
    await flush()

    expect(mocks.createSession).toHaveBeenCalledTimes(2)
    expect(mocks.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        workspacePath: '/tmp/workspace-1'
      })
    )
  })
})

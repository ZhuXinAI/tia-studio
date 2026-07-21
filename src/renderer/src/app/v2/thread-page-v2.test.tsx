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
      { id: 'chats', name: 'Chats', rootPath: '/tmp/chats', builtInKind: 'chats' },
      {
        id: 'workspace-1',
        name: 'Fixture workspace',
        rootPath: '/tmp/workspace-1',
        builtInKind: null
      }
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

  it('keeps the new-chat route as an empty composer until the user sends a message', async () => {
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

    expect(container.textContent).toContain('What are we building?')
    expect(container.textContent).toContain('OpenAI · gpt-5')
    expect(container.textContent).toContain('Ask Permission')
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('selects the workspace identified by pwd without creating a session', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/chat/new?pwd=workspace-1']}>
            <Routes>
              <Route path="/chat/new" element={<ThreadPageV2 />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })
    await flush()

    expect(container.textContent).toContain('Fixture workspace')
    expect(container.textContent).toContain('OpenAI · gpt-5')
    expect(container.textContent).toContain('Ask Permission')
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('keeps chat and workspace new routes available without creating sessions on navigation', async () => {
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
    expect(mocks.createSession).not.toHaveBeenCalled()

    const workspaceLink = Array.from(container.querySelectorAll('a')).find(
      (link) => link.textContent === 'New workspace thread'
    )
    await act(async () => workspaceLink?.click())
    await flush()

    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})

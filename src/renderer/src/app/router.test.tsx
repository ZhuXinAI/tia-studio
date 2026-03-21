// @vitest-environment jsdom

import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppMemoryRouter } from './router'

function renderRouter(initialEntries: string[]): string {
  const router = createAppMemoryRouter(initialEntries)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      },
      mutations: {
        retry: false
      }
    }
  })

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('app router', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('redirects root route to /chat when no app mode has been stored', async () => {
    const router = createAppMemoryRouter(['/'])

    await router.navigate('/')
    expect(router.state.location.pathname).toBe('/chat')
  })

  it('redirects root route to /chat when chat mode was the last active mode', async () => {
    window.localStorage.setItem('tia.app.last-mode', JSON.stringify({ mode: 'chat' }))

    const router = createAppMemoryRouter(['/'])

    await router.navigate('/')

    expect(router.state.location.pathname).toBe('/chat')
  })

  it('redirects root route to /team when team mode was the last active mode', async () => {
    window.localStorage.setItem('tia.app.last-mode', JSON.stringify({ mode: 'team' }))

    const router = createAppMemoryRouter(['/'])

    await router.navigate('/')

    expect(router.state.location.pathname).toBe('/team')
  })

  it('redirects settings index route to /settings/general', async () => {
    const router = createAppMemoryRouter(['/settings'])

    await router.navigate('/settings')
    expect(router.state.location.pathname).toBe('/settings/general')
  })

  it('renders general settings route with settings sidebar', () => {
    const html = renderRouter(['/settings/general'])

    expect(html).toContain('General Settings')
    expect(html).toContain('Language')
    expect(html).toContain('General')
    expect(html).toContain('Model Provider')
  })

  it('renders provider settings route', () => {
    const html = renderRouter(['/settings/providers'])

    expect(html).toContain('PROVIDERS')
    expect(html).toContain('Search providers...')
    expect(html).toContain('Model Provider')
    expect(html).toContain('Security &amp; Privacy')
    expect(html).toContain('Browsing')
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
  })

  it('renders security settings route', () => {
    const html = renderRouter(['/settings/security'])

    expect(html).toContain('Security &amp; Privacy')
    expect(html).toContain('Configure LLM guardrails')
    expect(html).toContain('Loading security settings...')
  })

  it('renders web search settings route', () => {
    const html = renderRouter(['/settings/web-search'])

    expect(html).toContain('Browsing')
    expect(html).toContain('Browser Automation')
  })

  it('renders mcp server settings route', () => {
    const html = renderRouter(['/settings/mcp-servers'])

    expect(html).toContain('MCP Server Settings')
    expect(html).toContain('MCP Servers')
  })

  it('renders runtime setup route', () => {
    const html = renderRouter(['/settings/runtimes'])

    expect(html).toContain('Runtime Setup')
    expect(html).toContain('bun')
    expect(html).toContain('Runtime Setup')
  })

  it('renders coding settings route', () => {
    const html = renderRouter(['/settings/coding'])

    expect(html).toContain('Coding')
    expect(html).toContain('Codex ACP')
    expect(html).toContain('Claude Agent ACP')
  })

  it('renders about settings route', () => {
    const html = renderRouter(['/settings/about'])

    expect(html).toContain('About &amp; Feedback')
    expect(html).toContain('TIA Studio')
    expect(html).toContain('Check Update')
  })

  it('renders display settings route with settings sidebar', () => {
    const html = renderRouter(['/settings/display'])

    expect(html).toContain('Display Settings')
    expect(html).toContain('Model Provider')
    expect(html).toContain('Browsing')
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
  })

  it('renders channels settings route', () => {
    const html = renderRouter(['/settings/channels'])

    expect(html).toContain('Channels')
    expect(html).toContain('Configured Channels')
    expect(html).toContain('Add Channel')
  })

  it('renders the assistant and channel management route', () => {
    const html = renderRouter(['/claws'])

    expect(html).toContain('Assistants &amp; Channels')
    expect(html).toContain('Create your first assistant')
    expect(html).toContain('Create Assistant')
  })

  it('renders cron jobs settings route', () => {
    const html = renderRouter(['/settings/cron-jobs'])

    expect(html).toContain('Cron Jobs')
    expect(html).toContain('Scheduled Jobs')
    expect(html).toContain('Loading cron jobs')
    expect(html).toContain('Channels')
    expect(html).toContain('Browsing')
  })

  it('renders chat route with the thread sidebar shell while assistant detail restores', () => {
    const html = renderRouter(['/chat'])

    expect(html).toContain('Conversations')
    expect(html).toContain('Loading assistants...')
  })

  it('renders header nav with chats, team, and the shell context switcher', () => {
    const html = renderRouter(['/chat'])

    expect(html).toContain('aria-label="Open settings"')
    expect(html).toContain('Chats')
    expect(html).toContain('Team')
    expect(html).toContain('Current assistant')
    expect(html).toContain('aria-label="Switch active assistant"')
    expect(html).not.toContain('Control Center')
  })

  it('renders the team route from the top nav', () => {
    const html = renderRouter(['/team'])

    expect(html).toContain('Chats')
    expect(html).toContain('Team')
    expect(html).toContain('Team Workspaces')
    expect(html).toContain('Team Chat')
    expect(html).toContain('Team Status')
  })

  it('renders a direct team thread route without falling into the route error UI', async () => {
    const router = createAppMemoryRouter(['/team/workspace-1/thread-1'])

    await router.navigate('/team/workspace-1/thread-1')

    const html = renderToString(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: {
                retry: false
              },
              mutations: {
                retry: false
              }
            }
          })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(router.state.location.pathname).toBe('/team/workspace-1/thread-1')
    expect(html).toContain('Team Workspaces')
    expect(html).not.toContain('Something went wrong')
    expect(html).not.toContain('Not Found')
  })
})

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

  it('redirects root route to /chat even when a stale team mode is stored', async () => {
    window.localStorage.setItem('tia.app.last-mode', JSON.stringify({ mode: 'team' }))

    const router = createAppMemoryRouter(['/'])

    await router.navigate('/')

    expect(router.state.location.pathname).toBe('/chat')
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
    expect(html).toContain('Back to app')
    expect(html).not.toContain('Workspace Defaults')
  })

  it('renders provider settings route', () => {
    const html = renderRouter(['/settings/providers'])

    expect(html).toContain('Added providers')
    expect(html).toContain('Search providers...')
    expect(html).toContain('Model Provider')
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
    expect(html).not.toContain('Browsing')
    expect(html).not.toContain('Coding')
    expect(html).not.toContain('Runtime Setup')
  })

  it('renders mcp server settings route', () => {
    const html = renderRouter(['/settings/mcp-servers'])

    expect(html).toContain('MCP Server Settings')
    expect(html).toContain('MCP Servers')
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
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
    expect(html).toContain('Appearance Tokens')
    expect(html).not.toContain('Browsing')
    expect(html).not.toContain('Runtime Setup')
  })

  it('renders channels settings route', () => {
    const html = renderRouter(['/settings/channels'])

    expect(html).toContain('Channels')
    expect(html).toContain('Active Channels')
    expect(html).toContain('Add Channel')
  })

  it('renders the new-chat route in the AppV2 thread shell', () => {
    const html = renderRouter(['/chat/new'])

    expect(html).toContain('Chats')
    expect(html).toContain('New Chat')
    expect(html).not.toContain('Thread Details')
  })

  it('renders the AppV2 shell with sidebar actions and workspace navigation', () => {
    const html = renderRouter(['/chat'])

    expect(html).toContain('New Chat')
    expect(html).toContain('Skills')
    expect(html).toContain('Automations')
    expect(html).toContain('aria-label="Open settings"')
    expect(html).toContain('Create workspace')
    expect(html).toContain('Workspaces')
    expect(html).toContain('Workspace')
    expect(html).toContain('Chats')
    expect(html).not.toContain('Control Center')
  })

  it('renders the dedicated skills route', () => {
    const html = renderRouter(['/skills'])

    expect(html).toContain('Search detected skills')
    expect(html).toContain('Loading detected skills...')
  })

  it('renders the dedicated automations route', () => {
    const html = renderRouter(['/automations'])

    expect(html).toContain('Imported Codex automation definitions')
    expect(html).toContain('Search automations')
  })
})

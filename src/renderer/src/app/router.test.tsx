import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
  it('redirects root route to /chat', async () => {
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
  })

  it('renders provider settings route', () => {
    const html = renderRouter(['/settings/providers'])

    expect(html).toContain('PROVIDERS')
    expect(html).toContain('Search providers...')
    expect(html).toContain('Model Provider')
    expect(html).toContain('Security &amp; Privacy')
    expect(html).toContain('Web Search')
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

    expect(html).toContain('Web Search')
    expect(html).toContain('Default Search Engine')
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
    expect(html).toContain('Web Search')
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
  })

  it('renders channels settings route', () => {
    const html = renderRouter(['/settings/channels'])

    expect(html).toContain('Channels')
    expect(html).toContain('Configured Channels')
    expect(html).toContain('Add Channel')
  })

  it('renders claws route from the top nav', () => {
    const html = renderRouter(['/claws'])

    expect(html).toContain('Claws')
    expect(html).toContain('Set up your first claw')
    expect(html).toContain('Create Your First Claw')
  })

  it('renders cron jobs settings route', () => {
    const html = renderRouter(['/settings/cron-jobs'])

    expect(html).toContain('Cron Jobs')
    expect(html).toContain('Scheduled Jobs')
    expect(html).toContain('Loading cron jobs')
    expect(html).toContain('Channels')
    expect(html).toContain('Web Search')
  })

  it('renders chat route with assistant creation controls', () => {
    const html = renderRouter(['/chat'])

    expect(html).toContain('Assistants')
    expect(html).toContain('aria-label="Create assistant"')
  })

  it('renders header nav with settings gear icon and no legacy control center sidebar', () => {
    const html = renderRouter(['/chat'])

    expect(html).toContain('aria-label="Open settings"')
    expect(html).toContain('Chats')
    expect(html).toContain('Claws')
    expect(html).toContain('Team')
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

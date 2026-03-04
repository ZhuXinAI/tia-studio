import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RouterProvider } from 'react-router-dom'
import { createAppMemoryRouter } from './router'

describe('app router', () => {
  it('redirects root route to /chat', async () => {
    const router = createAppMemoryRouter(['/'])

    await router.navigate('/')
    expect(router.state.location.pathname).toBe('/chat')
  })

  it('redirects settings index route to /settings/about', async () => {
    const router = createAppMemoryRouter(['/settings'])

    await router.navigate('/settings')
    expect(router.state.location.pathname).toBe('/settings/about')
  })

  it('renders provider settings route', () => {
    const router = createAppMemoryRouter(['/settings/providers'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Model Provider Settings')
    expect(html).toContain('Model Provider')
    expect(html).toContain('Web Search')
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
  })

  it('renders web search settings route', () => {
    const router = createAppMemoryRouter(['/settings/web-search'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Web Search')
    expect(html).toContain('Default Search Engine')
  })

  it('renders mcp server settings route', () => {
    const router = createAppMemoryRouter(['/settings/mcp-servers'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('MCP Server Settings')
    expect(html).toContain('MCP Servers')
  })

  it('renders about settings route', () => {
    const router = createAppMemoryRouter(['/settings/about'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('About &amp; Feedback')
    expect(html).toContain('Tia Studio')
    expect(html).toContain('Check Update')
  })

  it('renders display settings route with settings sidebar', () => {
    const router = createAppMemoryRouter(['/settings/display'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Display Settings')
    expect(html).toContain('Model Provider')
    expect(html).toContain('Web Search')
    expect(html).toContain('MCP Servers')
    expect(html).toContain('About &amp; Feedback')
  })

  it('renders chat route with assistant creation controls', () => {
    const router = createAppMemoryRouter(['/chat'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Assistants')
    expect(html).toContain('aria-label="Create assistant"')
  })

  it('renders header nav with settings gear icon and no legacy control center sidebar', () => {
    const router = createAppMemoryRouter(['/chat'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('aria-label="Open settings"')
    expect(html).not.toContain('Control Center')
    expect(html).toContain('data-slot="button"')
  })
})

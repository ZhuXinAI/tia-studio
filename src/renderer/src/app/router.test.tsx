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

  it('renders provider settings route', () => {
    const router = createAppMemoryRouter(['/settings/providers'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Model Provider Settings')
    expect(html).toContain('Model Provider')
    expect(html).toContain('Web Search')
  })

  it('renders web search settings route', () => {
    const router = createAppMemoryRouter(['/settings/web-search'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Web Search')
    expect(html).toContain('Default Search Engine')
  })

  it('renders assistants route with creation entrypoint', () => {
    const router = createAppMemoryRouter(['/assistants'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Assistants')
    expect(html).toContain('New Assistant')
  })

  it('renders header nav with settings gear icon and no legacy control center sidebar', () => {
    const router = createAppMemoryRouter(['/chat'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('aria-label="Open settings"')
    expect(html).not.toContain('Control Center')
    expect(html).toContain('data-slot="button"')
  })
})

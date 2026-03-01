import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RouterProvider } from 'react-router-dom'
import { createAppMemoryRouter } from './router'

describe('app router', () => {
  it('redirects root route to /assistants', async () => {
    const router = createAppMemoryRouter(['/'])

    await router.navigate('/')
    expect(router.state.location.pathname).toBe('/assistants')
  })

  it('renders provider settings route', () => {
    const router = createAppMemoryRouter(['/settings/providers'])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('Model Provider Settings')
  })
})

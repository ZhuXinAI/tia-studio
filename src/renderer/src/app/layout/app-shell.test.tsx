import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './app-shell'

describe('AppShell', () => {
  it('uses zero padding and a draggable header with no-drag controls', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <AppShell />
      }
    ])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('flex-1 p-0')
    expect(html).not.toContain('p-4 md:p-6')
    expect(html).toContain('drag-region')
    expect(html).toContain('no-drag')
  })
})

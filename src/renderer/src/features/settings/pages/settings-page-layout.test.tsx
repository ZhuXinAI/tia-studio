import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SettingsPageLayout } from './settings-page-layout'

describe('settings page layout', () => {
  it('uses the chat-style split layout with full height and a divider', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/settings',
          element: <SettingsPageLayout />,
          children: [
            {
              path: 'providers',
              element: <div>Model Provider Settings</div>
            }
          ]
        }
      ],
      {
        initialEntries: ['/settings/providers']
      }
    )

    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('h-[calc(100vh-3.5rem)]')
    expect(html).toContain('data-slot="sidebar"')
    expect(html).toContain('border-r border-border/70')
    expect(html).toContain('Model Provider Settings')
  })
})

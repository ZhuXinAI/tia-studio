import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '../../../i18n'
import { SettingsPageLayout } from './settings-page-layout'

describe('settings page layout', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en-US')
  })

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

    expect(html).toContain('data-slot="sidebar"')
    expect(html).toContain('border-r border-[color:var(--surface-border)]')
    expect(html).toContain('Model Provider Settings')
    expect(html).toContain('Channels')
    expect(html).toContain('Back to app')
  })

  it('renders translated sidebar labels from the active locale', async () => {
    await i18n.changeLanguage('zh-CN')

    const router = createMemoryRouter(
      [
        {
          path: '/settings',
          element: <SettingsPageLayout />,
          children: [
            {
              path: 'general',
              element: <div>Settings Content</div>
            }
          ]
        }
      ],
      {
        initialEntries: ['/settings/general']
      }
    )

    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('常规')
    expect(html).toContain('频道')
    expect(html).toContain('显示')
    expect(html).not.toContain('工作区默认设置')
  })
})

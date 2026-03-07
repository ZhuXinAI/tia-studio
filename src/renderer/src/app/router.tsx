import { createHashRouter, createMemoryRouter, redirect, type RouteObject } from 'react-router-dom'
import { AppShell } from './layout/app-shell'
import { ThreadPage } from '../features/threads/pages/thread-page'
import { ProvidersSettingsPage } from '../features/settings/pages/providers-settings-page'
import { WebSearchSettingsPage } from '../features/settings/pages/web-search-settings-page'
import { McpServersSettingsPage } from '../features/settings/pages/mcp-servers-settings-page'
import { AboutSettingsPage } from '../features/settings/pages/about-settings-page'
import { DisplaySettingsPage } from '../features/settings/pages/display-settings-page'
import { SettingsPageLayout } from '../features/settings/pages/settings-page-layout'
import { RouteError } from '../components/route-error'

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        loader: () => redirect('/chat')
      },
      {
        path: 'chat',
        element: <ThreadPage />
      },
      {
        path: 'chat/:assistantId',
        element: <ThreadPage />
      },
      {
        path: 'chat/:assistantId/:threadId',
        element: <ThreadPage />
      },
      {
        path: 'settings',
        element: <SettingsPageLayout />,
        children: [
          {
            index: true,
            loader: () => redirect('/settings/about')
          },
          {
            path: 'providers',
            element: <ProvidersSettingsPage />
          },
          {
            path: 'web-search',
            element: <WebSearchSettingsPage />
          },
          {
            path: 'mcp-servers',
            element: <McpServersSettingsPage />
          },
          {
            path: 'about',
            element: <AboutSettingsPage />
          },
          {
            path: 'display',
            element: <DisplaySettingsPage />
          }
        ]
      }
    ]
  }
]

export function createAppRouter(): ReturnType<typeof createHashRouter> {
  return createHashRouter(appRoutes)
}

export function createAppMemoryRouter(
  initialEntries: string[] = ['/chat']
): ReturnType<typeof createMemoryRouter> {
  return createMemoryRouter(appRoutes, {
    initialEntries
  })
}

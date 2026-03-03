import {
  createHashRouter,
  createMemoryRouter,
  redirect,
  type RouteObject
} from 'react-router-dom'
import { AppShell } from './layout/app-shell'
import { AssistantsPage } from '../features/assistants/pages/assistants-page'
import { ThreadPage } from '../features/threads/pages/thread-page'
import { ProvidersSettingsPage } from '../features/settings/pages/providers-settings-page'
import { WebSearchSettingsPage } from '../features/settings/pages/web-search-settings-page'
import { McpServersSettingsPage } from '../features/settings/pages/mcp-servers-settings-page'

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        loader: () => redirect('/chat')
      },
      {
        path: 'chat/:assistantId?/:threadId?',
        element: <ThreadPage />
      },
      {
        path: 'assistants',
        element: <AssistantsPage />
      },
      {
        path: 'assistants/:assistantId/threads/:threadId?',
        element: <ThreadPage />
      },
      {
        path: 'settings/providers',
        element: <ProvidersSettingsPage />
      },
      {
        path: 'settings/web-search',
        element: <WebSearchSettingsPage />
      },
      {
        path: 'settings/mcp-servers',
        element: <McpServersSettingsPage />
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

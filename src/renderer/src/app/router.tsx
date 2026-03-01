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

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        loader: () => redirect('/assistants')
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
      }
    ]
  }
]

export function createAppRouter() {
  return createHashRouter(appRoutes)
}

export function createAppMemoryRouter(initialEntries: string[] = ['/assistants']) {
  return createMemoryRouter(appRoutes, {
    initialEntries
  })
}

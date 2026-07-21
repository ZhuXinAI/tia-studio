import { createHashRouter, createMemoryRouter, redirect, type RouteObject } from 'react-router-dom'
import '../i18n'
import { AppV2Shell } from './v2/app-v2-shell'
import { ThreadPageV2 } from './v2/thread-page-v2'
import { ProvidersSettingsPage } from '../features/settings/pages/providers-settings-page'
import { AboutSettingsPage } from '../features/settings/pages/about-settings-page'
import { DisplaySettingsPage } from '../features/settings/pages/display-settings-page'
import { GeneralSettingsPage } from '../features/settings/pages/general-settings-page'
import { SettingsPageLayout } from '../features/settings/pages/settings-page-layout'
import { RouteError } from '../components/route-error'
import { ChannelsSettingsPage } from '../features/settings/pages/channels-settings-page'
import { appEntryLoader } from './routes/app-entry-loader'
import { AppEntryRoute } from './routes/app-entry-route'
import { SkillsPage } from '../features/skills/pages/skills-page'
import { AutomationsPage } from '../features/automations/pages/automations-page'
import { PermissionsSettingsPage } from '../features/settings/pages/permissions-settings-page'

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppV2Shell />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <AppEntryRoute />,
        loader: appEntryLoader
      },
      {
        path: 'chat',
        loader: () => redirect('/chat/new')
      },
      {
        path: 'chat/new',
        element: <ThreadPageV2 />
      },
      {
        path: 'chat/:threadId',
        element: <ThreadPageV2 />
      },
      {
        path: 'workspaces/:workspaceId',
        loader: ({ params }) => redirect(`/workspaces/${params.workspaceId}/new`)
      },
      {
        path: 'workspaces/:workspaceId/new',
        element: <ThreadPageV2 />
      },
      {
        path: 'workspaces/:workspaceId/threads/:threadId',
        element: <ThreadPageV2 />
      },
      {
        path: 'skills',
        element: <SkillsPage />
      },
      {
        path: 'automations',
        element: <AutomationsPage />
      },
      {
        path: 'settings',
        element: <SettingsPageLayout />,
        children: [
          {
            index: true,
            loader: () => redirect('/settings/general')
          },
          {
            path: 'general',
            element: <GeneralSettingsPage />
          },
          {
            path: 'providers',
            element: <ProvidersSettingsPage />
          },
          {
            path: 'channels',
            element: <ChannelsSettingsPage />
          },
          {
            path: 'permissions',
            element: <PermissionsSettingsPage />
          },
          {
            path: 'mcp-servers',
            loader: () => redirect('/skills?tab=mcps')
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
  initialEntries: string[] = ['/']
): ReturnType<typeof createMemoryRouter> {
  return createMemoryRouter(appRoutes, {
    initialEntries
  })
}

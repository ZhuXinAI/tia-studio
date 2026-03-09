import { createHashRouter, createMemoryRouter, redirect, type RouteObject } from 'react-router-dom'
import '../i18n'
import { AppShell } from './layout/app-shell'
import { ThreadPage } from '../features/threads/pages/thread-page'
import { ClawsPage } from '../features/claws/pages/claws-page'
import { ProvidersSettingsPage } from '../features/settings/pages/providers-settings-page'
import { CronJobsSettingsPage } from '../features/settings/pages/cron-jobs-settings-page'
import { WebSearchSettingsPage } from '../features/settings/pages/web-search-settings-page'
import { McpServersSettingsPage } from '../features/settings/pages/mcp-servers-settings-page'
import { AboutSettingsPage } from '../features/settings/pages/about-settings-page'
import { DisplaySettingsPage } from '../features/settings/pages/display-settings-page'
import { GeneralSettingsPage } from '../features/settings/pages/general-settings-page'
import { RuntimeSetupPage } from '../features/settings/pages/runtime-setup-page'
import { SettingsPageLayout } from '../features/settings/pages/settings-page-layout'
import { RouteError } from '../components/route-error'
import { TeamPage } from '../features/team/pages/team-page'
import { ChannelsSettingsPage } from '../features/settings/pages/channels-settings-page'

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
        path: 'team/:workspaceId?/:threadId?',
        element: <TeamPage />
      },
      {
        path: 'claws',
        element: <ClawsPage />
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
            path: 'cron-jobs',
            element: <CronJobsSettingsPage />
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
            path: 'runtimes',
            element: <RuntimeSetupPage />
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

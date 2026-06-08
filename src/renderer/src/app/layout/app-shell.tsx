import { Clock3, MessageSquarePlus, Settings, Sparkles } from 'lucide-react'
import { useTranslation } from '../../i18n/use-app-translation'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import clsx from 'clsx'
import { useAutoUpdate } from '../../features/settings/auto-update/use-auto-update'
import { WorkspaceSidebar } from './workspace-sidebar'
import { useWorkspaces } from '../../features/workspaces/workspaces-query'

function isWindowsPlatform(): boolean {
  return globalThis.window?.electron?.process.platform === 'win32'
}

export function AppShell(): React.JSX.Element {
  const { t } = useTranslation()
  const { hasDownloadedUpdate, isRestartingToUpdate, restartToUpdate } = useAutoUpdate()
  const location = useLocation()
  const workspacePathMatch = /^\/workspaces\/([^/]+)(?:\/|$)/.exec(location.pathname)
  const activeWorkspaceRouteId = workspacePathMatch?.[1] ?? null
  const { data: workspaces = [] } = useWorkspaces({
    enabled: activeWorkspaceRouteId !== null
  })
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const isWorkspaceRoute = activeWorkspaceRouteId !== null
  const isConversationRoute = isChatRoute || isWorkspaceRoute
  const isSkillsRoute = location.pathname === '/skills'
  const isAutomationsRoute = location.pathname === '/automations'
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const activeWorkspace = activeWorkspaceRouteId
    ? (workspaces.find((workspace) => workspace.id === activeWorkspaceRouteId) ?? null)
    : null
  const activeWorkspaceName = isChatRoute
    ? 'Chats'
    : isWorkspaceRoute
      ? (activeWorkspace?.name ?? null)
      : null
  const newChatHref = activeWorkspaceRouteId
    ? `/workspaces/${activeWorkspaceRouteId}/new`
    : '/chat/new'

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--surface-canvas)] text-foreground transition-colors duration-200">
      <header
        className={clsx(
          'drag-region sticky top-0 z-20 border-b border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_94%,transparent),color-mix(in_srgb,var(--surface-panel)_94%,transparent))] pr-3 py-2 shadow-[0_1px_0_0_var(--surface-border)] backdrop-blur-xl',
          {
            'pl-[80px]': !isWindowsPlatform()
          }
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="min-w-0 shrink-0">
              <p className="section-kicker">Local-first AI workspace</p>
              <p className="font-editorial truncate text-[1.3rem] leading-none tracking-[-0.03em]">
                TIA Studio
              </p>
            </div>

            <div className="no-drag flex items-center gap-1 rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-1.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]">
              <Button
                asChild
                variant={isConversationRoute ? 'secondary' : 'ghost'}
                size="sm"
                className="no-drag"
              >
                <NavLink to={newChatHref} className="no-drag inline-flex items-center gap-2">
                  <MessageSquarePlus className="size-4" />
                  <span className="text-sm font-medium">New Chat</span>
                </NavLink>
              </Button>
              <Button
                asChild
                variant={isSkillsRoute ? 'secondary' : 'ghost'}
                size="sm"
                className="no-drag"
              >
                <NavLink to="/skills" className="no-drag inline-flex items-center gap-2">
                  <Sparkles className="size-4" />
                  <span className="text-sm font-medium">Skills</span>
                </NavLink>
              </Button>
              <Button
                asChild
                variant={isAutomationsRoute ? 'secondary' : 'ghost'}
                size="sm"
                className="no-drag"
              >
                <NavLink to="/automations" className="no-drag inline-flex items-center gap-2">
                  <Clock3 className="size-4" />
                  <span className="text-sm font-medium">Automations</span>
                </NavLink>
              </Button>
            </div>
            {activeWorkspaceName ? (
              <div className="min-w-0 rounded-[1rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_70%,transparent),var(--surface-panel-soft))] px-3.5 py-2 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_42%,transparent)]">
                <span className="section-kicker block">Workspace</span>
                <span className="font-editorial block truncate text-lg leading-none tracking-[-0.02em]">
                  {activeWorkspaceName}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {hasDownloadedUpdate ? (
              <Button
                type="button"
                size="sm"
                className="no-drag shrink-0 px-4 font-semibold"
                disabled={isRestartingToUpdate}
                onClick={() => {
                  void restartToUpdate()
                }}
              >
                {isRestartingToUpdate ? t('appShell.nav.updating') : t('appShell.nav.update')}
              </Button>
            ) : null}

            <Button
              asChild
              variant={isSettingsRoute ? 'secondary' : 'ghost'}
              size="icon"
              className="no-drag"
            >
              <NavLink
                to="/settings/about"
                aria-label={t('appShell.nav.openSettings')}
                className={cn('no-drag inline-flex items-center justify-center')}
              >
                <Settings className="size-4" />
              </NavLink>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-5 px-4 pb-4 pt-5">
        <WorkspaceSidebar />
        <div className="min-h-0 flex-1 p-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

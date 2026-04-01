import { useEffect } from 'react'
import { Bot, Settings, Users } from 'lucide-react'
import { useTranslation } from '../../i18n/use-app-translation'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import clsx from 'clsx'
import { useAutoUpdate } from '../../features/settings/auto-update/use-auto-update'
import { storeAppMode } from '../navigation/app-mode-state'
import { ChatContextSwitcher } from './chat-context-switcher'
import { TeamContextSwitcher } from './team-context-switcher'

function isWindowsPlatform(): boolean {
  return globalThis.window?.electron?.process.platform === 'win32'
}

export function AppShell(): React.JSX.Element {
  const { t } = useTranslation()
  const { hasDownloadedUpdate, isRestartingToUpdate, restartToUpdate } = useAutoUpdate()
  const location = useLocation()
  const isChatRoute =
    location.pathname.startsWith('/chat') || location.pathname.startsWith('/agents')
  const isClawsRoute = location.pathname.startsWith('/claws')
  const isChatAreaRoute = isChatRoute || isClawsRoute
  const isTeamRoute = location.pathname.startsWith('/team')
  const isSettingsRoute = location.pathname.startsWith('/settings')

  useEffect(() => {
    if (isTeamRoute) {
      storeAppMode('team')
      return
    }

    if (isChatAreaRoute) {
      storeAppMode('chat')
    }
  }, [isChatAreaRoute, isTeamRoute])

  const contextualControl = isChatRoute ? (
    <ChatContextSwitcher />
  ) : isTeamRoute ? (
    <TeamContextSwitcher />
  ) : isClawsRoute ? (
    <div className="no-drag min-w-0 px-1">
      <span className="truncate text-sm font-semibold">
        {t('appShell.context.assistantsChannels')}
      </span>
    </div>
  ) : null

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--surface-canvas)] text-foreground transition-colors duration-200">
      <header
        className={clsx(
          'drag-region sticky top-0 z-20 border-b border-border/70 border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] pr-3 py-2 shadow-[0_1px_0_0_var(--surface-border)] backdrop-blur-xl',
          {
          'pl-[80px]': !isWindowsPlatform()
          }
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-1">
              <Button
                asChild
                variant={isTeamRoute ? 'secondary' : 'ghost'}
                size="sm"
                className="no-drag rounded-full"
              >
                <NavLink to="/team" className="no-drag inline-flex items-center gap-2">
                  <Users className="size-4" />
                  <span className="text-sm font-medium">{t('appShell.nav.team')}</span>
                </NavLink>
              </Button>

              <Button
                asChild
                variant={isChatAreaRoute ? 'secondary' : 'ghost'}
                size="sm"
                className="no-drag rounded-full"
              >
                <NavLink to="/agents" className="no-drag inline-flex items-center gap-2">
                  <Bot className="size-4" />
                  <span className="text-sm font-medium">{t('appShell.nav.chats')}</span>
                </NavLink>
              </Button>
            </div>

            {contextualControl ? (
              <div className="h-5 w-px shrink-0 bg-[color:var(--surface-border)]" />
            ) : null}

            {contextualControl ? <div className="min-w-0 flex-1">{contextualControl}</div> : null}
          </div>

          <div className="flex items-center gap-2">
            {hasDownloadedUpdate ? (
              <Button
                type="button"
                size="sm"
                className="no-drag shrink-0 rounded-full px-4 font-semibold"
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
              className="no-drag rounded-full"
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

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 p-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

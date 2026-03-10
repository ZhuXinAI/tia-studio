import { Bot, Home, Settings, Users } from 'lucide-react'
import { useTranslation } from '../../i18n/use-app-translation'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

export function AppShell(): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const isChatRoute = location.pathname.startsWith('/chat')
  const isClawsRoute = location.pathname.startsWith('/claws')
  const isTeamRoute = location.pathname.startsWith('/team')
  const isSettingsRoute = location.pathname.startsWith('/settings')

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-200">
      <header className="drag-region sticky top-0 z-20 border-b border-border/70 bg-background/20 pl-[80px] pr-3 py-1 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant={isClawsRoute ? 'secondary' : 'ghost'}
              size="sm"
              className="no-drag"
            >
              <NavLink to="/claws" className="no-drag inline-flex items-center gap-2">
                <Bot className="size-4" />
                <span className="text-sm font-medium">{t('appShell.nav.claws')}</span>
              </NavLink>
            </Button>

            <Button
              asChild
              variant={isChatRoute ? 'secondary' : 'ghost'}
              size="sm"
              className="no-drag"
            >
              <NavLink to="/chat" className="no-drag inline-flex items-center gap-2">
                <Home className="size-4" />
                <span className="text-sm font-medium">{t('appShell.nav.chats')}</span>
              </NavLink>
            </Button>

            <Button
              asChild
              variant={isTeamRoute ? 'secondary' : 'ghost'}
              size="sm"
              className="no-drag"
            >
              <NavLink to="/team" className="no-drag inline-flex items-center gap-2">
                <Users className="size-4" />
                <span className="text-sm font-medium">{t('appShell.nav.team')}</span>
              </NavLink>
            </Button>
          </div>

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
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 p-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

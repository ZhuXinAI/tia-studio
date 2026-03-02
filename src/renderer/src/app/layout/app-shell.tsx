import { Home, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const isSettingsRoute = location.pathname.startsWith('/settings')

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_15%_0%,rgba(94,234,212,0.11),transparent_42%),radial-gradient(circle_at_85%_10%,rgba(147,197,253,0.12),transparent_38%),linear-gradient(180deg,var(--background),#05070b)] text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <NavLink to="/chat" className="inline-flex items-center gap-2">
              <Home className="size-4" />
              <span className="text-sm font-medium">Home</span>
            </NavLink>
          </Button>

          <Button asChild variant={isSettingsRoute ? 'secondary' : 'ghost'} size="icon">
            <NavLink
              to="/settings/providers"
              aria-label="Open settings"
              className={cn('inline-flex items-center justify-center')}
            >
              <Settings className="size-4" />
            </NavLink>
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

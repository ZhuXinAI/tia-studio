import { Home, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const isSettingsRoute = location.pathname.startsWith('/settings')

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-200">
      <header className="drag-region sticky top-0 z-20 border-b border-border/70 bg-background/20 pl-[80px] pr-3 py-1 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="no-drag">
            <NavLink to="/chat" className="no-drag inline-flex items-center gap-2">
              <Home className="size-4" />
              <span className="text-sm font-medium">Home</span>
            </NavLink>
          </Button>

          <Button
            asChild
            variant={isSettingsRoute ? 'secondary' : 'ghost'}
            size="icon"
            className="no-drag"
          >
            <NavLink
              to="/settings/about"
              aria-label="Open settings"
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

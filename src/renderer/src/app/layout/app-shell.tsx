import { Link, Outlet } from 'react-router-dom'
import { StudioSidebar } from './studio-sidebar'
import { Button } from '../../components/ui/button'

export function AppShell(): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(94,234,212,0.11),transparent_42%),radial-gradient(circle_at_85%_10%,rgba(147,197,253,0.12),transparent_38%),linear-gradient(180deg,var(--background),#05070b)] text-foreground">
      <StudioSidebar />
      <main className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Tia Studio</p>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/assistants">Assistants</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/settings/providers">Providers</Link>
              </Button>
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

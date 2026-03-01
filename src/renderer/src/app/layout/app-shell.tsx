import { Link, Outlet } from 'react-router-dom'

export function AppShell(): React.JSX.Element {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <h2 className="app-shell__title">tia-studio</h2>
        <nav className="app-shell__nav">
          <Link className="app-shell__nav-link" to="/assistants">
            Assistants
          </Link>
          <Link className="app-shell__nav-link" to="/settings/providers">
            Model Provider
          </Link>
        </nav>
      </aside>
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  )
}

import { NavLink, Outlet } from 'react-router-dom'

export function AppShell(): React.JSX.Element {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <header className="app-sidebar__header">
          <p className="app-sidebar__eyebrow">Tia Studio</p>
          <h2 className="app-sidebar__title">Control Center</h2>
        </header>

        <div className="app-sidebar__section">
          <p className="app-sidebar__section-title">Workspace</p>
          <nav className="app-sidebar__nav">
            <NavLink
              className={({ isActive }) =>
                `app-sidebar__link ${isActive ? 'app-sidebar__link--active' : ''}`
              }
              to="/assistants"
            >
              Assistants
            </NavLink>
          </nav>
        </div>

        <div className="app-sidebar__section">
          <p className="app-sidebar__section-title">Settings</p>
          <nav className="app-sidebar__nav">
            <NavLink
              className={({ isActive }) =>
                `app-sidebar__link ${isActive ? 'app-sidebar__link--active' : ''}`
              }
              to="/settings/providers"
            >
              Model Providers
            </NavLink>
          </nav>
        </div>
      </aside>

      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  )
}

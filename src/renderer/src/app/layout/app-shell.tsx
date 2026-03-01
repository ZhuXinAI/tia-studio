import { Link, Outlet } from 'react-router-dom'

export function AppShell(): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid #1f1f1f', padding: '16px' }}>
        <h2 style={{ marginTop: 0 }}>tia-studio</h2>
        <nav style={{ display: 'grid', gap: '8px' }}>
          <Link to="/assistants">Assistants</Link>
          <Link to="/settings/providers">Model Provider</Link>
        </nav>
      </aside>
      <main style={{ padding: '20px' }}>
        <Outlet />
      </main>
    </div>
  )
}

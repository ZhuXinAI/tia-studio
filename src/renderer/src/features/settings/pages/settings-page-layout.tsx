import { Outlet } from 'react-router-dom'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'

export function SettingsPageLayout(): React.JSX.Element {
  return (
    <section
      className="flex min-h-[680px] min-w-[1120px] flex-row overflow-hidden rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] shadow-[0_24px_70px_-52px_rgba(15,23,42,0.55)]"
      style={{
        height: `calc(100vh - 45px)`
      }}
    >
      <SettingsSidebarNav />

      <div className="min-h-0 flex-1 overflow-y-auto px-8">
        <Outlet />
      </div>
    </section>
  )
}

import { Outlet } from 'react-router-dom'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'

export function SettingsPageLayout(): React.JSX.Element {
  return (
    <section
      className="flex min-h-[680px] min-w-[1120px] flex-row bg-muted/30"
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

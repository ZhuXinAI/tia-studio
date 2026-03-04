import { Outlet } from 'react-router-dom'
import { SidebarInset } from '../../../components/ui/sidebar'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'

export function SettingsPageLayout(): React.JSX.Element {
  return (
    <section className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-none border border-border/80 bg-background/50">
      <SettingsSidebarNav />

      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none p-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <Outlet />
        </div>
      </SidebarInset>
    </section>
  )
}

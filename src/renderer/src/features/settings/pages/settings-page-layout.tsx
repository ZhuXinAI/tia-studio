import { Outlet } from 'react-router-dom'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'

export function SettingsPageLayout(): React.JSX.Element {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-row overflow-hidden">
      <SettingsSidebarNav />

      <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_68%,transparent))] px-8">
        <Outlet />
      </div>
    </section>
  )
}

import { Outlet } from 'react-router-dom'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { SidebarInset } from '../../../components/ui/sidebar'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'
import { SettingsPageShell } from './settings-content'

export function SettingsPageLayout(): React.JSX.Element {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-row overflow-hidden bg-background">
      <SettingsSidebarNav />

      <SidebarInset className="flex h-full min-w-0 flex-col">
        <main className="min-h-0 min-w-0 flex-1 bg-background">
          <ScrollArea className="h-full">
            <SettingsPageShell>
              <Outlet />
            </SettingsPageShell>
          </ScrollArea>
        </main>
      </SidebarInset>
    </section>
  )
}

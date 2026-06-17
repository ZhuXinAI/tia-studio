import clsx from 'clsx'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppV2Sidebar } from './app-v2-sidebar'

function isWindowsPlatform(): boolean {
  return globalThis.window?.electron?.process.platform === 'win32'
}

export function AppV2Shell(): React.JSX.Element {
  const location = useLocation()
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const isSidebarToolRoute = location.pathname === '/skills' || location.pathname === '/automations'
  const isWorkspaceRoute = /^\/workspaces\/[^/]+(?:\/|$)/.test(location.pathname)
  const shouldShowSidebar = isChatRoute || isWorkspaceRoute || isSidebarToolRoute
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className="app-v2-shell flex h-screen min-h-0 overflow-hidden bg-[color:var(--surface-canvas)] text-foreground">
      <div
        className={clsx('drag-region fixed left-0 right-0 top-0 z-30 h-8', {
          'pl-[80px]': !isWindowsPlatform()
        })}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {shouldShowSidebar ? (
            <AppV2Sidebar
              isCollapsed={isSidebarCollapsed}
              onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
            />
          ) : null}
          <main
            className={clsx(
              'min-h-0 min-w-0 flex-1 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_84%,transparent))] pt-8',
              isSettingsRoute ? 'overflow-hidden' : 'overflow-hidden'
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

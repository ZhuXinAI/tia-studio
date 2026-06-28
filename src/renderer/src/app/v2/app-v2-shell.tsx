import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppV2Sidebar } from './app-v2-sidebar'
import { AppV2ShellRightRail, AppV2ShellRightRailContext } from './app-v2-shell-right-rail'
import {
  AppV2ShellRouteStatus,
  AppV2ShellStatusBar,
  AppV2ShellStatusContext
} from './app-v2-shell-status'
import { isDesktopWindowsPlatform } from '../../lib/desktop-bootstrap'

function isWindowsPlatform(): boolean {
  return isDesktopWindowsPlatform()
}

export function AppV2Shell(): React.JSX.Element {
  const location = useLocation()
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const isSidebarToolRoute = location.pathname === '/skills' || location.pathname === '/automations'
  const isWorkspaceRoute = /^\/workspaces\/[^/]+(?:\/|$)/.test(location.pathname)
  const shouldShowSidebar = isChatRoute || isWorkspaceRoute || isSidebarToolRoute
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [statusBarContent, setStatusBarContent] = useState<React.ReactNode | null>(null)
  const [isRightRailOpen, setIsRightRailOpen] = useState(false)
  const [hasRightRailContent, setHasRightRailContent] = useState(false)
  const [rightRailSlotElement, setRightRailSlotElement] = useState<HTMLDivElement | null>(null)
  const toggleRightRail = useCallback(() => {
    setIsRightRailOpen((current) => !current)
  }, [])
  const statusBarContextValue = useMemo(
    () => ({
      setContent: setStatusBarContent
    }),
    []
  )
  const rightRailContextValue = useMemo(
    () => ({
      isOpen: isRightRailOpen,
      setIsOpen: setIsRightRailOpen,
      toggle: toggleRightRail,
      setHasContent: setHasRightRailContent,
      slotElement: rightRailSlotElement
    }),
    [isRightRailOpen, rightRailSlotElement, toggleRightRail]
  )
  const fallbackStatusBarContent = useMemo(() => {
    if (location.pathname === '/skills') {
      return <AppV2ShellRouteStatus kind="skills" />
    }

    if (location.pathname === '/automations') {
      return <AppV2ShellRouteStatus kind="automations" />
    }

    if (isSettingsRoute) {
      return <AppV2ShellRouteStatus kind="settings" />
    }

    if (isWorkspaceRoute) {
      return <AppV2ShellRouteStatus kind="workspace" />
    }

    return <AppV2ShellRouteStatus kind="chat" />
  }, [isSettingsRoute, isWorkspaceRoute, location.pathname])

  return (
    <AppV2ShellRightRailContext.Provider value={rightRailContextValue}>
      <AppV2ShellStatusContext.Provider value={statusBarContextValue}>
        <div className="app-v2-shell relative flex h-screen min-h-0 overflow-hidden bg-transparent text-foreground">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="app-window-ambient absolute inset-0" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_18%,transparent),color-mix(in_srgb,var(--surface-canvas)_38%,transparent))]" />
          </div>
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
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  <main
                    className={clsx(
                      'min-h-0 min-w-0 flex-1 bg-transparent pt-8',
                      isSettingsRoute ? 'overflow-hidden' : 'overflow-hidden'
                    )}
                  >
                    <Outlet />
                  </main>
                  {hasRightRailContent && isRightRailOpen ? (
                    <AppV2ShellRightRail onSlotElementChange={setRightRailSlotElement} />
                  ) : null}
                </div>
                <AppV2ShellStatusBar content={statusBarContent ?? fallbackStatusBarContent} />
              </div>
            </div>
          </div>
        </div>
      </AppV2ShellStatusContext.Provider>
    </AppV2ShellRightRailContext.Provider>
  )
}

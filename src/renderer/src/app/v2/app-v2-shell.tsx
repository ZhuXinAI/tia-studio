import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppV2Sidebar } from './app-v2-sidebar'
import { AppV2ShellRightRail, AppV2ShellRightRailContext } from './app-v2-shell-right-rail'
import { isDesktopWindowsPlatform } from '../../lib/desktop-bootstrap'
import { AppV2TitlebarContext } from './app-v2-titlebar'

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
  const [isRightRailOpen, setIsRightRailOpen] = useState(false)
  const [hasRightRailContent, setHasRightRailContent] = useState(false)
  const [rightRailSlotElement, setRightRailSlotElement] = useState<HTMLDivElement | null>(null)
  const [titlebarTitle, setTitlebarTitle] = useState<string | null>(null)
  const titlebarSidebarWidth = shouldShowSidebar ? (isSidebarCollapsed ? '3rem' : '18rem') : '0px'
  const toggleRightRail = useCallback(() => {
    setIsRightRailOpen((current) => !current)
  }, [])
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
  const titlebarContextValue = useMemo(() => ({ setTitle: setTitlebarTitle }), [])
  return (
    <AppV2TitlebarContext.Provider value={titlebarContextValue}>
      <AppV2ShellRightRailContext.Provider value={rightRailContextValue}>
        <div
          className="app-v2-shell relative flex h-screen min-h-0 overflow-hidden bg-[color:var(--shell-canvas)] text-foreground"
          style={{ ['--app-v2-sidebar-width' as string]: titlebarSidebarWidth }}
        >
          {!isWindowsPlatform() ? (
            <div className="drag-region fixed left-0 right-0 top-0 z-30 grid h-8 grid-cols-[var(--app-v2-sidebar-width)_minmax(0,1fr)] overflow-hidden">
              <div className="border-r border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg)]" />
              <div className="bg-[color:var(--surface-paper)]" />
              {titlebarTitle ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center px-24 text-xs font-medium text-muted-foreground">
                  {titlebarTitle}
                </span>
              ) : null}
            </div>
          ) : null}
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
                      'min-h-0 min-w-0 flex-1 bg-[color:var(--surface-paper)]',
                      !isWindowsPlatform() && 'pt-8',
                      isSettingsRoute ? 'overflow-hidden' : 'overflow-hidden'
                    )}
                  >
                    <Outlet />
                  </main>
                  {hasRightRailContent && isRightRailOpen ? (
                    <AppV2ShellRightRail onSlotElementChange={setRightRailSlotElement} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppV2ShellRightRailContext.Provider>
    </AppV2TitlebarContext.Provider>
  )
}

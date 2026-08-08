import clsx from 'clsx'
import { PanelBottom, PanelRight, PanelRightOpen, SquarePen } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { AppV2Sidebar } from './app-v2-sidebar'
import { AppV2ShellRightRail, AppV2ShellRightRailContext } from './app-v2-shell-right-rail'
import { AppV2ShellBottomDrawer, AppV2ShellBottomDrawerContext } from './app-v2-shell-bottom-drawer'
import { BOTTOM_DRAWER_DEFAULT_HEIGHT, RIGHT_RAIL_DEFAULT_WIDTH } from './app-v2-shell-resize'
import { isDesktopWindowsPlatform } from '../../lib/desktop-bootstrap'
import { AppV2TitlebarContext } from './app-v2-titlebar'
import { CommandPalette } from '../../features/navigation/components/command-palette'
import { Button } from '../../components/ui/button'
import { useTranslation } from '../../i18n/use-app-translation'

function isWindowsPlatform(): boolean {
  return isDesktopWindowsPlatform()
}

export function AppV2Shell(): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const params = useParams<{ workspaceId?: string }>()
  const windowsPlatform = isWindowsPlatform()
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const isSidebarToolRoute =
    location.pathname === '/skills' ||
    location.pathname === '/automations' ||
    location.pathname === '/command-center' ||
    location.pathname === '/integrations' ||
    location.pathname === '/memories'
  const isWorkspaceRoute = /^\/workspaces\/[^/]+(?:\/|$)/.test(location.pathname)
  const isThreadChromeRoute = isChatRoute || isWorkspaceRoute
  const shouldShowSidebar = isChatRoute || isWorkspaceRoute || isSidebarToolRoute
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isRightRailOpen, setIsRightRailOpen] = useState(false)
  const [hasRightRailContent, setHasRightRailContent] = useState(false)
  const [rightRailSlotElement, setRightRailSlotElement] = useState<HTMLDivElement | null>(null)
  const [rightRailWidth, setRightRailWidth] = useState(RIGHT_RAIL_DEFAULT_WIDTH)
  const [isBottomDrawerOpen, setIsBottomDrawerOpen] = useState(false)
  const [hasBottomDrawerContent, setHasBottomDrawerContent] = useState(false)
  const [bottomDrawerSlotElement, setBottomDrawerSlotElement] = useState<HTMLDivElement | null>(
    null
  )
  const [bottomDrawerHeight, setBottomDrawerHeight] = useState(BOTTOM_DRAWER_DEFAULT_HEIGHT)
  const [titlebarTitle, setTitlebarTitle] = useState<string | null>(null)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const titlebarSidebarWidth = shouldShowSidebar ? (isSidebarCollapsed ? '3rem' : '18rem') : '0px'
  const newThreadHref = params.workspaceId
    ? `/chat/new?pwd=${encodeURIComponent(params.workspaceId)}`
    : '/chat/new'
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
  const toggleBottomDrawer = useCallback(() => {
    setIsBottomDrawerOpen((current) => !current)
  }, [])
  const bottomDrawerContextValue = useMemo(
    () => ({
      isOpen: isBottomDrawerOpen,
      setIsOpen: setIsBottomDrawerOpen,
      toggle: toggleBottomDrawer,
      setHasContent: setHasBottomDrawerContent,
      slotElement: bottomDrawerSlotElement
    }),
    [bottomDrawerSlotElement, isBottomDrawerOpen, toggleBottomDrawer]
  )
  const titlebarContextValue = useMemo(() => ({ setTitle: setTitlebarTitle }), [])
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsCommandPaletteOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])
  return (
    <AppV2TitlebarContext.Provider value={titlebarContextValue}>
      <AppV2ShellRightRailContext.Provider value={rightRailContextValue}>
        <AppV2ShellBottomDrawerContext.Provider value={bottomDrawerContextValue}>
          <div
            className="app-v2-shell relative flex h-screen min-h-0 overflow-hidden bg-[color:var(--shell-canvas)] text-foreground"
            style={{ ['--app-v2-sidebar-width' as string]: titlebarSidebarWidth }}
          >
            {!windowsPlatform ? (
              <div
                className="drag-region fixed left-0 top-0 z-30 h-8 w-[var(--app-v2-sidebar-width)] overflow-hidden border-r border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg)]"
                aria-hidden="true"
              />
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
                    <div
                      data-testid="app-v2-thread-container"
                      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                    >
                      {!isWindowsPlatform() ? (
                        <div
                          className={clsx(
                            'drag-region flex h-8 shrink-0 items-center gap-1.5 overflow-hidden px-2.5',
                            !isThreadChromeRoute && 'bg-[color:var(--surface-paper)]'
                          )}
                        >
                          {isThreadChromeRoute && isSidebarCollapsed ? (
                            <NavLink
                              to={newThreadHref}
                              className="no-drag inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[color:var(--surface-muted)] hover:text-foreground"
                              aria-label={t('appShell.nav.newChat')}
                              title={t('appShell.nav.newChat')}
                            >
                              <SquarePen className="size-3.5" />
                            </NavLink>
                          ) : null}
                          {titlebarTitle || isThreadChromeRoute ? (
                            <span className="pointer-events-none min-w-0 truncate text-xs font-medium text-muted-foreground">
                              {titlebarTitle ?? t('appShell.nav.newChat')}
                            </span>
                          ) : null}
                          {isThreadChromeRoute ? (
                            <div className="no-drag ml-auto flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={clsx(
                                  'size-7 text-muted-foreground',
                                  isBottomDrawerOpen &&
                                    'bg-[color:var(--surface-active)] text-foreground'
                                )}
                                disabled={!hasBottomDrawerContent}
                                aria-label={t('appShell.nav.toggleTerminal')}
                                title={t('appShell.nav.toggleTerminal')}
                                aria-pressed={isBottomDrawerOpen}
                                aria-expanded={isBottomDrawerOpen}
                                onClick={toggleBottomDrawer}
                              >
                                <PanelBottom className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={clsx(
                                  'size-7 text-muted-foreground',
                                  isRightRailOpen &&
                                    'bg-[color:var(--surface-active)] text-foreground'
                                )}
                                disabled={!hasRightRailContent}
                                aria-label={t('appShell.nav.toggleTools')}
                                title={t('appShell.nav.toggleTools')}
                                aria-pressed={isRightRailOpen}
                                aria-expanded={isRightRailOpen}
                                onClick={toggleRightRail}
                              >
                                {isRightRailOpen ? (
                                  <PanelRightOpen className="size-3.5" />
                                ) : (
                                  <PanelRight className="size-3.5" />
                                )}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <main
                        className={clsx(
                          'min-h-0 min-w-0 flex-1',
                          isThreadChromeRoute ? 'bg-background' : 'bg-[color:var(--surface-paper)]',
                          isThreadChromeRoute && windowsPlatform && 'pt-8',
                          isSettingsRoute ? 'overflow-hidden' : 'overflow-hidden'
                        )}
                      >
                        <Outlet />
                      </main>
                    </div>
                    {hasRightRailContent && isRightRailOpen ? (
                      <AppV2ShellRightRail
                        onSlotElementChange={setRightRailSlotElement}
                        width={rightRailWidth}
                        onWidthChange={setRightRailWidth}
                      />
                    ) : null}
                  </div>
                  {hasBottomDrawerContent && isBottomDrawerOpen ? (
                    <AppV2ShellBottomDrawer
                      onSlotElementChange={setBottomDrawerSlotElement}
                      height={bottomDrawerHeight}
                      onHeightChange={setBottomDrawerHeight}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </AppV2ShellBottomDrawerContext.Provider>
        {isCommandPaletteOpen ? (
          <CommandPalette open={isCommandPaletteOpen} onOpenChange={setIsCommandPaletteOpen} />
        ) : null}
      </AppV2ShellRightRailContext.Provider>
    </AppV2TitlebarContext.Provider>
  )
}

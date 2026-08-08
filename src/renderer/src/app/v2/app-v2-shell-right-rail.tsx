import { createContext, useContext } from 'react'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'
import { RIGHT_RAIL_MAX_WIDTH, RIGHT_RAIL_MIN_WIDTH, usePanelResize } from './app-v2-shell-resize'

type AppV2ShellRightRailContextValue = {
  isOpen: boolean
  setIsOpen: (nextOpen: boolean) => void
  toggle: () => void
  setHasContent: (hasContent: boolean) => void
  slotElement: HTMLDivElement | null
}

const noop = () => undefined

export const AppV2ShellRightRailContext = createContext<AppV2ShellRightRailContextValue | null>(
  null
)

export function AppV2ShellRightRail({
  onSlotElementChange,
  width,
  onWidthChange
}: {
  onSlotElementChange: (element: HTMLDivElement | null) => void
  width: number
  onWidthChange: (width: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { isResizing, onPointerDown, onKeyDown } = usePanelResize({
    axis: 'horizontal',
    size: width,
    min: RIGHT_RAIL_MIN_WIDTH,
    max: RIGHT_RAIL_MAX_WIDTH,
    onSizeChange: onWidthChange
  })

  return (
    <aside
      aria-label={t('appShell.nav.toggleTools')}
      data-testid="app-v2-right-rail"
      style={{ width: `${width}px` }}
      className="app-shell-pane relative hidden min-h-0 min-w-0 shrink-0 overflow-hidden border-l border-[color:var(--chat-surface-border)] xl:flex"
    >
      <div
        role="separator"
        aria-label={t('appShell.nav.resizeTools')}
        aria-orientation="vertical"
        aria-valuemin={RIGHT_RAIL_MIN_WIDTH}
        aria-valuemax={RIGHT_RAIL_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className={cn(
          'group absolute inset-y-0 -left-1 z-20 flex w-2 cursor-col-resize touch-none items-center justify-center outline-none',
          isResizing && 'bg-primary/10'
        )}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <span
          aria-hidden
          className={cn(
            'h-10 w-0.5 rounded-full bg-border/70 transition-colors group-hover:bg-primary/70 group-focus-visible:bg-primary',
            isResizing && 'bg-primary'
          )}
        />
      </div>
      <div
        ref={onSlotElementChange}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      />
    </aside>
  )
}

export function useAppV2ShellRightRail(): AppV2ShellRightRailContextValue {
  const context = useContext(AppV2ShellRightRailContext)

  if (context) {
    return context
  }

  return {
    isOpen: false,
    setIsOpen: noop,
    toggle: noop,
    setHasContent: noop,
    slotElement: null
  }
}

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext } from 'react'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'
import {
  BOTTOM_DRAWER_MAX_HEIGHT,
  BOTTOM_DRAWER_MIN_HEIGHT,
  usePanelResize
} from './app-v2-shell-resize'

type AppV2ShellBottomDrawerContextValue = {
  isOpen: boolean
  setIsOpen: (nextOpen: boolean) => void
  toggle: () => void
  setHasContent: (hasContent: boolean) => void
  slotElement: HTMLDivElement | null
}

const noop = () => undefined

export const AppV2ShellBottomDrawerContext =
  createContext<AppV2ShellBottomDrawerContextValue | null>(null)

export function AppV2ShellBottomDrawer({
  onSlotElementChange,
  height,
  onHeightChange
}: {
  onSlotElementChange: (element: HTMLDivElement | null) => void
  height: number
  onHeightChange: (height: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { isResizing, onPointerDown, onKeyDown } = usePanelResize({
    axis: 'vertical',
    size: height,
    min: BOTTOM_DRAWER_MIN_HEIGHT,
    max: BOTTOM_DRAWER_MAX_HEIGHT,
    onSizeChange: onHeightChange
  })

  return (
    <section
      aria-label={t('terminalRail.title')}
      data-testid="app-v2-bottom-drawer"
      style={{ height: `${height}px` }}
      className="app-shell-pane relative max-h-[70vh] min-h-0 shrink-0 animate-in slide-in-from-bottom-4 fade-in-0 overflow-hidden border-t border-[color:var(--chat-surface-border)] duration-200 motion-reduce:animate-none"
    >
      <div
        role="separator"
        aria-label={t('appShell.nav.resizeTerminal')}
        aria-orientation="horizontal"
        aria-valuemin={BOTTOM_DRAWER_MIN_HEIGHT}
        aria-valuemax={BOTTOM_DRAWER_MAX_HEIGHT}
        aria-valuenow={height}
        tabIndex={0}
        className={cn(
          'group absolute inset-x-0 -top-1 z-20 flex h-2 cursor-row-resize touch-none items-center justify-center outline-none',
          isResizing && 'bg-primary/10'
        )}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <span
          aria-hidden
          className={cn(
            'h-0.5 w-10 rounded-full bg-border/70 transition-colors group-hover:bg-primary/70 group-focus-visible:bg-primary',
            isResizing && 'bg-primary'
          )}
        />
      </div>
      <div
        ref={onSlotElementChange}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      />
    </section>
  )
}

export function useAppV2ShellBottomDrawer(): AppV2ShellBottomDrawerContextValue {
  const context = useContext(AppV2ShellBottomDrawerContext)

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

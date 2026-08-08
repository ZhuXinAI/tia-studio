/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext } from 'react'

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
  onSlotElementChange
}: {
  onSlotElementChange: (element: HTMLDivElement | null) => void
}): React.JSX.Element {
  return (
    <section
      aria-label="Terminal drawer"
      data-testid="app-v2-bottom-drawer"
      className="app-shell-pane h-[min(24rem,42vh)] min-h-0 shrink-0 overflow-hidden border-t border-[color:var(--chat-surface-border)]"
    >
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

import { createContext, useContext } from 'react'

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
  onSlotElementChange
}: {
  onSlotElementChange: (element: HTMLDivElement | null) => void
}): React.JSX.Element {
  return (
    <aside className="app-shell-pane hidden min-h-0 min-w-0 w-80 max-w-80 shrink-0 overflow-hidden border-l border-[color:var(--chat-surface-border)] xl:flex">
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

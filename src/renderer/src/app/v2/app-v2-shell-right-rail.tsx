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
    <aside className="hidden min-h-0 w-[19rem] shrink-0 border-l border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_84%,transparent),color-mix(in_srgb,var(--surface-panel)_92%,transparent))] xl:flex">
      <div ref={onSlotElementChange} className="flex min-h-0 flex-1 flex-col" />
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

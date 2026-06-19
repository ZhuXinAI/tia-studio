import { Bot, Cable, Clock3, Gauge, MessageSquare, Settings2, Sparkles } from 'lucide-react'
import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'

type AppV2ShellStatusContextValue = {
  setContent: (content: ReactNode | null) => void
}

export const AppV2ShellStatusContext = createContext<AppV2ShellStatusContextValue | null>(null)

function StatusItem({
  icon: Icon,
  label
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-2.5 py-1 text-[11px] text-muted-foreground">
      <Icon className="size-3.5" />
      <span>{label}</span>
    </span>
  )
}

export function AppV2ShellStatusBar({
  content
}: {
  content: ReactNode
}): React.JSX.Element {
  return (
    <footer className="flex h-11 shrink-0 items-center border-t border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel)_94%,transparent),color-mix(in_srgb,var(--surface-panel-strong)_96%,transparent))] px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap">
        {content}
      </div>
    </footer>
  )
}

export function AppV2ShellRouteStatus({
  kind
}: {
  kind: 'chat' | 'skills' | 'automations' | 'settings' | 'workspace'
}): React.JSX.Element {
  if (kind === 'skills') {
    return (
      <>
        <StatusItem icon={Sparkles} label="Skills catalog" />
        <StatusItem icon={Bot} label="Reusable capabilities" />
      </>
    )
  }

  if (kind === 'automations') {
    return (
      <>
        <StatusItem icon={Clock3} label="Automations" />
        <StatusItem icon={Gauge} label="Scheduled workspace runs" />
      </>
    )
  }

  if (kind === 'settings') {
    return (
      <>
        <StatusItem icon={Settings2} label="Settings" />
        <StatusItem icon={Bot} label="Desktop preferences" />
      </>
    )
  }

  if (kind === 'workspace') {
    return (
      <>
        <StatusItem icon={MessageSquare} label="Workspace thread view" />
        <StatusItem icon={Gauge} label="Shell chrome active" />
      </>
    )
  }

  return (
    <>
      <StatusItem icon={MessageSquare} label="Chats workspace" />
      <StatusItem icon={Cable} label="Shell ready" />
    </>
  )
}

export function useAppV2ShellStatusBar(content: ReactNode | null): void {
  const context = useContext(AppV2ShellStatusContext)

  useEffect(() => {
    if (!context) {
      return
    }

    context.setContent(content)

    return () => {
      context.setContent(null)
    }
  }, [content, context])
}

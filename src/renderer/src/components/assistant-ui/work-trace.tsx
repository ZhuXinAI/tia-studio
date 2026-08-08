import { useAuiState } from '@assistant-ui/react'
import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { isWorkTraceActive, resolveWorkDuration } from './work-duration'
import { DotMatrix } from './dot-matrix'
import { useTranslation } from '../../i18n/use-app-translation'

function formatWorkDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function useWorkTracePresentation(): { activelyWorking: boolean; label: string } {
  const { t } = useTranslation()
  const running = useAuiState((state) => state.message.status?.type === 'running')
  const threadRunning = useAuiState((state) => state.thread.isRunning)
  const isLastMessage = useAuiState((state) => state.message.isLast)
  const waitingOnUser = useAuiState(
    (state) => state.message.metadata?.custom?.waitingOnUser === true
  )
  const messageCreatedAt = useAuiState((state) => state.message.createdAt?.getTime())
  const workStartedAt = useAuiState((state) => {
    const timestamp = state.message.metadata?.custom?.workStartedAtMs
    return typeof timestamp === 'number' ? timestamp : undefined
  })
  const storedDuration = useAuiState((state) => {
    const duration = state.message.metadata?.custom?.workDurationMs
    return typeof duration === 'number' ? duration : undefined
  })
  const startedAt = workStartedAt ?? messageCreatedAt
  const [elapsed, setElapsed] = useState(() => (startedAt ? Date.now() - startedAt : 0))
  const activelyWorking = isWorkTraceActive({
    messageRunning: running,
    threadRunning,
    isLastMessage,
    waitingOnUser
  })

  useEffect(() => {
    if (!activelyWorking || !startedAt) return
    const update = (): void => setElapsed(Date.now() - startedAt)
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [activelyWorking, startedAt])

  const duration = resolveWorkDuration({ elapsed, running: activelyWorking, storedDuration })
  const label = t(
    waitingOnUser
      ? 'threads.ui.workedForWaitingOnUser'
      : activelyWorking
        ? 'threads.ui.workingFor'
        : 'threads.ui.workedFor',
    {
      duration: formatWorkDuration(duration)
    }
  )

  return { activelyWorking, label }
}

export function WorkTraceSummary({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { activelyWorking, label } = useWorkTracePresentation()

  return (
    <button
      type="button"
      data-slot="work-trace-trigger"
      data-state={open ? 'open' : 'closed'}
      aria-expanded={open}
      className="group/work-trace mb-3 flex items-center gap-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onOpenChange(!open)}
    >
      {activelyWorking ? (
        <DotMatrix state="thinking" label={t('threads.ui.working')} className="size-3.5" />
      ) : null}
      <span className="tabular-nums">{label}</span>
      <ChevronDownIcon className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

export function WorkTraceContent({
  open,
  children
}: PropsWithChildren<{ open: boolean }>): React.JSX.Element | null {
  if (!open) return null

  return (
    <div
      data-slot="work-trace-content"
      className="flex flex-col gap-2 pb-2 pt-1 animate-in fade-in-0 duration-150"
    >
      {children}
    </div>
  )
}

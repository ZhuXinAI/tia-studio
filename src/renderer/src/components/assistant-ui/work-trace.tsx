import { useAuiState } from '@assistant-ui/react'
import { ChevronDownIcon, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type FC, type PropsWithChildren } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { resolveWorkDuration } from './work-duration'

function formatWorkDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const WorkTrace: FC<PropsWithChildren> = ({ children }) => {
  const running = useAuiState((state) => state.message.status?.type === 'running')
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
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(() => (startedAt ? Date.now() - startedAt : 0))

  useEffect(() => {
    if (!running || !startedAt) return
    const update = (): void => setElapsed(Date.now() - startedAt)
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [running, startedAt])

  const duration = resolveWorkDuration({ elapsed, running, storedDuration })
  const label = `${running ? 'Working for' : 'Worked for'} ${formatWorkDuration(duration)}`

  return (
    <Collapsible className="group/work-trace mb-3" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        {running ? <LoaderCircle className="size-3.5 animate-spin" aria-label="Working" /> : null}
        <span className="tabular-nums">{label}</span>
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]/work-trace:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-2 pb-2 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { WorkTrace }

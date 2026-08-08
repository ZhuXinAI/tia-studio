import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Square,
  Terminal as TerminalIcon,
  X
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  TerminalClientEvent,
  TerminalRun,
  TerminalSocketEvent
} from '../../../../../shared/terminal'
import { Button } from '../../../components/ui/button'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  subscribeToTerminalSocket,
  useStartTerminal,
  useStopTerminal,
  useTerminalRuns
} from '../terminal-query'

type TerminalConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

function connectionLabel(
  state: TerminalConnectionState,
  status: TerminalRun['status'] | undefined,
  t: (key: string) => string
): string {
  if (status === 'exited' || status === 'failed' || status === 'stopped') {
    return t('terminalRail.exited')
  }
  if (state === 'connected') return t('terminalRail.connected')
  if (state === 'connecting') return t('terminalRail.connecting')
  if (state === 'disconnected') return t('terminalRail.disconnected')
  return t('terminalRail.starting')
}

function StatusIcon({ state }: { state: TerminalConnectionState }): React.JSX.Element {
  if (state === 'connected') return <CircleCheck className="size-3.5 text-emerald-400" />
  if (state === 'connecting')
    return <LoaderCircle className="size-3.5 animate-spin text-amber-300" />
  if (state === 'disconnected') return <CircleAlert className="size-3.5 text-rose-300" />
  return <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
}

export function TerminalRail({
  sessionId,
  slotElement,
  onClose
}: {
  sessionId: string
  slotElement: HTMLDivElement | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data: runs = [], isLoading } = useTerminalRuns(sessionId)
  const startMutation = useStartTerminal(sessionId)
  const stopMutation = useStopTerminal(sessionId)
  const terminalMountRef = useRef<HTMLDivElement | null>(null)
  const startRequestedRef = useRef(false)
  const sendEventRef = useRef<(event: TerminalClientEvent) => void>(() => undefined)
  const [startedTerminalId, setStartedTerminalId] = useState<string | null>(null)
  const [liveRun, setLiveRun] = useState<TerminalRun | null>(null)
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>('idle')
  const [terminalError, setTerminalError] = useState<string | null>(null)

  const activeRun = useMemo(() => runs.find((run) => run.status === 'running') ?? null, [runs])
  const terminalId = startedTerminalId ?? activeRun?.id ?? null
  const displayedRun =
    (terminalId ? runs.find((run) => run.id === terminalId) : null) ??
    (liveRun?.id === terminalId ? liveRun : null) ??
    activeRun

  useEffect(() => {
    if (startedTerminalId || !activeRun) return
    setStartedTerminalId(activeRun.id)
  }, [activeRun, startedTerminalId])

  useEffect(() => {
    if (isLoading || startRequestedRef.current || activeRun || startedTerminalId) return
    startRequestedRef.current = true
    setConnectionState('connecting')
    void startMutation
      .mutateAsync({})
      .then((run) => {
        setStartedTerminalId(run.id)
        setLiveRun(run)
      })
      .catch(() => {
        setConnectionState('disconnected')
      })
  }, [activeRun, isLoading, startMutation, startedTerminalId])

  useEffect(() => {
    const mountNode = terminalMountRef.current
    if (!mountNode || !terminalId) return

    let disposed = false
    const terminal = new XtermTerminal({
      convertEol: true,
      cursorBlink: true,
      scrollback: 10_000,
      fontFamily:
        '"SFMono-Regular", "Cascadia Mono", "JetBrains Mono", "Menlo", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 1.45,
      theme: {
        background: '#0d1017',
        foreground: '#f5f7fb',
        cursor: '#89b4ff',
        selectionBackground: 'rgba(137, 180, 255, 0.28)',
        black: '#1a2030',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4ff',
        magenta: '#cba6f7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#6c7086',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4ff',
        brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5',
        brightWhite: '#f5f7fb'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(mountNode)
    terminal.focus()

    const fitAndResize = (): void => {
      try {
        fitAddon.fit()
      } catch {
        return
      }
      sendEventRef.current({ type: 'resize', cols: terminal.cols, rows: terminal.rows })
    }
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitAndResize)
    resizeObserver?.observe(mountNode)
    fitAndResize()

    const inputDisposable = terminal.onData((data) => {
      sendEventRef.current({ type: 'input', data })
    })

    setConnectionState('connecting')
    setTerminalError(null)
    const unsubscribe = subscribeToTerminalSocket(
      sessionId,
      terminalId,
      (event: TerminalSocketEvent) => {
        if (disposed) return
        if (event.type === 'snapshot') {
          terminal.reset()
          if (event.data) terminal.write(event.data)
          setLiveRun(event.run)
          setConnectionState(event.run.status === 'running' ? 'connected' : 'disconnected')
          return
        }
        if (event.type === 'output') {
          terminal.write(event.data)
          return
        }
        if (event.type === 'state') {
          setLiveRun(event.run)
          if (event.run.status !== 'running') setConnectionState('disconnected')
          return
        }
        setTerminalError(event.message)
      },
      (error) => {
        if (!disposed) {
          setConnectionState('disconnected')
          setTerminalError(
            error instanceof Error ? error.message : t('terminalRail.connectionFailed')
          )
        }
      },
      () => {
        if (!disposed) setConnectionState('disconnected')
      },
      (send) => {
        sendEventRef.current = send
        setConnectionState('connected')
        fitAndResize()
      }
    )

    return () => {
      disposed = true
      inputDisposable.dispose()
      resizeObserver?.disconnect()
      unsubscribe()
      sendEventRef.current = () => undefined
      terminal.dispose()
    }
  }, [sessionId, terminalId, t])

  if (!slotElement) return null

  const status = liveRun?.id === terminalId ? liveRun.status : displayedRun?.status
  const statusText = connectionLabel(connectionState, status, t)

  return createPortal(
    <div
      className="flex h-full min-h-0 flex-col bg-[#080a10] text-white"
      data-testid="terminal-rail"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-black/20 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <TerminalIcon className="size-4 shrink-0 text-slate-200" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-100">
              {t('terminalRail.title')}
            </h2>
            <p className="truncate text-[11px] text-slate-400">{t('terminalRail.description')}</p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[11px] text-slate-400 sm:flex">
            <StatusIcon state={connectionState} />
            {statusText}
          </span>
          {terminalId && status === 'running' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-slate-400 hover:bg-white/10 hover:text-white"
              disabled={stopMutation.isPending}
              onClick={() => void stopMutation.mutateAsync(terminalId)}
              aria-label={t('terminalRail.stop')}
              title={t('terminalRail.stop')}
            >
              <Square className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label={t('terminalRail.close')}
            title={t('terminalRail.close')}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {terminalError || startMutation.error ? (
        <p
          role="alert"
          className="shrink-0 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-200"
        >
          {terminalError ??
            (startMutation.error instanceof Error
              ? startMutation.error.message
              : t('terminalRail.startFailed'))}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden bg-[#0d1017] p-2">
        <div
          ref={terminalMountRef}
          className="terminal-mount h-full min-h-0 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0d1017] px-2 py-1"
          aria-label={t('terminalRail.outputLabel')}
        />
      </div>
      <footer className="flex min-h-8 shrink-0 items-center gap-2 border-t border-white/10 px-4 text-[10px] text-slate-500">
        <span className="truncate font-mono">
          {displayedRun?.cwd ?? t('terminalRail.starting')}
        </span>
        <span className="ml-auto shrink-0">{statusText}</span>
      </footer>
    </div>,
    slotElement
  )
}

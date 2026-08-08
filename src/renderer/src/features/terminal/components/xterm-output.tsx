import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'

export function XtermOutput({
  output,
  ariaLabel
}: {
  output: string
  ariaLabel: string
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const renderedOutputRef = useRef('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 3_000,
      theme: {
        background: '#09090b',
        foreground: '#f4f4f5',
        cursor: '#a1a1aa'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    terminalRef.current = terminal

    const fit = (): void => fitAddon.fit()
    fit()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    resizeObserver?.observe(container)

    return () => {
      resizeObserver?.disconnect()
      terminalRef.current = null
      terminal.dispose()
      renderedOutputRef.current = ''
    }
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal || output === renderedOutputRef.current) return

    if (output.startsWith(renderedOutputRef.current)) {
      terminal.write(output.slice(renderedOutputRef.current.length))
    } else {
      terminal.reset()
      terminal.write(output)
    }
    renderedOutputRef.current = output
  }, [output])

  return (
    <div className="relative h-[28rem] min-h-48 w-full bg-[#09090b]" aria-label={ariaLabel}>
      <div ref={containerRef} className="h-full w-full px-1 py-1" />
      <pre className="sr-only" aria-live="polite">
        {output}
      </pre>
    </div>
  )
}

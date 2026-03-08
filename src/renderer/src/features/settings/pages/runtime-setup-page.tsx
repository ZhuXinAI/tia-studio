import { Download, RefreshCcw, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import {
  checkManagedRuntimeLatest,
  clearManagedRuntime,
  createDefaultManagedRuntimesState,
  getManagedRuntimeStatus,
  installManagedRuntime,
  managedRuntimeKinds,
  pickCustomRuntime,
  type ManagedRuntimeKind,
  type ManagedRuntimesState
} from '../runtimes/managed-runtimes-query'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected managed runtime error'
}

export function RuntimeSetupPage(): React.JSX.Element {
  const [state, setState] = useState<ManagedRuntimesState>(createDefaultManagedRuntimesState())
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setIsLoading(true)

    try {
      setState(await getManagedRuntimeStatus())
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const runAction = async (
    kind: ManagedRuntimeKind,
    action: 'install' | 'pick' | 'check' | 'clear'
  ): Promise<void> => {
    const busyKey = `${kind}:${action}`
    setBusyAction(busyKey)

    try {
      if (action === 'install') {
        setState(await installManagedRuntime(kind))
        toast.success(`Installed latest ${kind} runtime.`)
        return
      }

      if (action === 'pick') {
        const nextState = await pickCustomRuntime(kind)
        if (nextState) {
          setState(nextState)
          toast.success(`Activated custom ${kind} runtime.`)
        }
        return
      }

      if (action === 'check') {
        setState(await checkManagedRuntimeLatest(kind))
        toast.success(`Checked ${kind} runtime status.`)
        return
      }

      setState(await clearManagedRuntime(kind))
      toast.success(`Cleared ${kind} runtime selection.`)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="py-4 flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Runtime Setup</h1>
        <p className="text-muted-foreground text-sm">
          Install managed <code>bun</code> and <code>uv</code> runtimes for MCP servers and
          runtime-backed tools, or point TIA Studio at a binary you already downloaded.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {managedRuntimeKinds.map((kind) => {
          const runtime = state[kind]

          return (
            <Card key={kind}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 lowercase">
                  <Wrench className="size-4" />
                  {kind}
                </CardTitle>
                <CardDescription>
                  {kind === 'bun'
                    ? 'Used for bun, bunx, and npx-backed MCP server launches.'
                    : 'Used for uv and uvx-backed MCP server launches.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-sm">
                  <p>
                    <span className="font-medium">Status:</span> {runtime.status}
                  </p>
                  <p>
                    <span className="font-medium">Source:</span> {runtime.source}
                  </p>
                  <p>
                    <span className="font-medium">Version:</span> {runtime.version ?? 'Not installed'}
                  </p>
                  <p>
                    <span className="font-medium">Binary:</span>{' '}
                    {runtime.binaryPath ?? 'No active binary selected'}
                  </p>
                  {runtime.errorMessage ? (
                    <p role="alert" className="text-destructive text-xs">
                      {runtime.errorMessage}
                    </p>
                  ) : null}
                  {isLoading ? (
                    <p className="text-muted-foreground text-xs">Loading runtime status...</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void runAction(kind, 'install')}
                    disabled={busyAction !== null}
                  >
                    <Download className="size-4" />
                    {busyAction === `${kind}:install` ? 'Installing...' : 'Install latest'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(kind, 'pick')}
                    disabled={busyAction !== null}
                  >
                    Use downloaded binary
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(kind, 'check')}
                    disabled={busyAction !== null}
                  >
                    <RefreshCcw className="size-4" />
                    {busyAction === `${kind}:check` ? 'Checking...' : 'Check again'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void runAction(kind, 'clear')}
                    disabled={busyAction !== null || runtime.source !== 'custom'}
                  >
                    Clear custom
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

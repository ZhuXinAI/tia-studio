import { Download, RefreshCcw, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
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

export function RuntimeSetupPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<ManagedRuntimesState>(createDefaultManagedRuntimesState())
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message.trim()
      if (message.length > 0) {
        return message
      }
    }

    return t('settings.runtime.toasts.unexpectedError')
  }

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
        toast.success(t('settings.runtime.toasts.installSuccess', { kind }))
        return
      }

      if (action === 'pick') {
        const nextState = await pickCustomRuntime(kind)
        if (nextState) {
          setState(nextState)
          toast.success(t('settings.runtime.toasts.pickSuccess', { kind }))
        }
        return
      }

      if (action === 'check') {
        setState(await checkManagedRuntimeLatest(kind))
        toast.success(t('settings.runtime.toasts.checkSuccess', { kind }))
        return
      }

      setState(await clearManagedRuntime(kind))
      toast.success(t('settings.runtime.toasts.clearSuccess', { kind }))
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="py-4 flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.runtime.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('settings.runtime.description')}
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
                    ? t('settings.runtime.kindDescription.bun')
                    : t('settings.runtime.kindDescription.uv')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-sm">
                  <p>
                    <span className="font-medium">{t('settings.runtime.labels.status')}</span>{' '}
                    {runtime.status}
                  </p>
                  <p>
                    <span className="font-medium">{t('settings.runtime.labels.source')}</span>{' '}
                    {runtime.source}
                  </p>
                  <p>
                    <span className="font-medium">{t('settings.runtime.labels.version')}</span>{' '}
                    {runtime.version ?? t('settings.runtime.values.notInstalled')}
                  </p>
                  <p>
                    <span className="font-medium">{t('settings.runtime.labels.binary')}</span>{' '}
                    {runtime.binaryPath ?? t('settings.runtime.values.noBinary')}
                  </p>
                  {runtime.errorMessage ? (
                    <p role="alert" className="text-destructive text-xs">
                      {runtime.errorMessage}
                    </p>
                  ) : null}
                  {isLoading ? (
                    <p className="text-muted-foreground text-xs">
                      {t('settings.runtime.values.loading')}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void runAction(kind, 'install')}
                    disabled={busyAction !== null}
                  >
                    <Download className="size-4" />
                    {busyAction === `${kind}:install`
                      ? t('settings.runtime.buttons.installing')
                      : t('settings.runtime.buttons.installLatest')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(kind, 'pick')}
                    disabled={busyAction !== null}
                  >
                    {t('settings.runtime.buttons.useDownloadedBinary')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(kind, 'check')}
                    disabled={busyAction !== null}
                  >
                    <RefreshCcw className="size-4" />
                    {busyAction === `${kind}:check`
                      ? t('settings.runtime.buttons.checking')
                      : t('settings.runtime.buttons.checkAgain')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void runAction(kind, 'clear')}
                    disabled={busyAction !== null || runtime.source !== 'custom'}
                  >
                    {t('settings.runtime.buttons.clearCustom')}
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

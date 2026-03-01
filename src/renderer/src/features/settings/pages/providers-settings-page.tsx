import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createProvider,
  listProviders,
  providerConnectionEventName,
  testProviderConnection,
  updateProvider,
  type ProviderRecord,
  type SaveProviderInput
} from '../providers/providers-query'
import { ProvidersForm } from '../providers/providers-form'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'

type ToastState = {
  kind: 'success' | 'error'
  message: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected request error'
}

function toInitialFormValue(provider: ProviderRecord | null) {
  if (!provider) {
    return undefined
  }

  return {
    name: provider.name,
    type: provider.type,
    apiKey: provider.apiKey,
    apiHost: provider.apiHost ?? '',
    selectedModel: provider.selectedModel,
    providerModelsText: provider.providerModels?.join('\n') ?? ''
  }
}

export function ProvidersSettingsPage(): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) {
      return null
    }

    return providers.find((provider) => provider.id === selectedProviderId) ?? null
  }, [providers, selectedProviderId])

  const refreshProviders = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextProviders = await listProviders()
      setProviders(nextProviders)
      setSelectedProviderId((currentProviderId) => {
        if (currentProviderId && nextProviders.some((provider) => provider.id === currentProviderId)) {
          return currentProviderId
        }

        return nextProviders.at(0)?.id ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshProviders()
  }, [refreshProviders])

  const handleSubmit = async (values: SaveProviderInput) => {
    setIsSubmitting(true)
    setToast(null)

    try {
      if (selectedProvider) {
        const updatedProvider = await updateProvider(selectedProvider.id, values)
        setProviders((currentProviders) =>
          currentProviders.map((provider) =>
            provider.id === updatedProvider.id ? updatedProvider : provider
          )
        )
        setToast({ kind: 'success', message: 'Provider saved locally.' })
      } else {
        const createdProvider = await createProvider(values)
        setProviders((currentProviders) => [createdProvider, ...currentProviders])
        setSelectedProviderId(createdProvider.id)
        setToast({ kind: 'success', message: 'Provider created locally.' })
      }
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTestConnection = async (values: SaveProviderInput) => {
    setIsTestingConnection(true)
    setToast(null)
    try {
      await testProviderConnection(values)
      setToast({
        kind: 'success',
        message: `Connection test event sent (${providerConnectionEventName}).`
      })
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const startCreateFlow = () => {
    setSelectedProviderId(null)
    setToast(null)
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Model Provider Settings</h1>
        <p className="text-muted-foreground text-sm">
          Stored offline on this desktop. Saving does not call external services. Use{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">Test Connection</code> to emit a local
          check event.
        </p>
      </header>

      {toast ? (
        <p
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            toast.kind === 'error'
              ? 'border-destructive/70 text-destructive'
              : 'border-emerald-400/70 text-emerald-300'
          )}
        >
          {toast.message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Providers</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={startCreateFlow}>
                + New
              </Button>
            </div>
            <CardDescription>One selected model per provider.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <p className="text-muted-foreground text-sm">Loading providers...</p> : null}
            {!isLoading && providers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No providers yet. Create one to get started.</p>
            ) : null}

            <div className="space-y-2">
              {providers.map((provider) => {
                const isActive = provider.id === selectedProviderId
                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      isActive
                        ? 'border-primary/80 bg-primary/10'
                        : 'border-border/70 bg-card/60 hover:bg-accent/30'
                    )}
                    onClick={() => {
                      setSelectedProviderId(provider.id)
                      setToast(null)
                    }}
                    disabled={isSubmitting || isTestingConnection}
                  >
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {provider.type} / {provider.selectedModel}
                    </p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{selectedProvider ? 'Edit Provider' : 'Create Provider'}</CardTitle>
            <CardDescription>Credentials are saved locally only.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProvidersForm
              key={selectedProvider?.id ?? 'new-provider'}
              initialValue={toInitialFormValue(selectedProvider)}
              isPrebuilt={Boolean(selectedProvider?.providerModels?.length)}
              isSubmitting={isSubmitting}
              isTestingConnection={isTestingConnection}
              onSubmit={handleSubmit}
              onTestConnection={handleTestConnection}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

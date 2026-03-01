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
    <section className="provider-page">
      <header className="provider-page__header">
        <h1>Model Provider Settings</h1>
        <p>
          Stored offline on this desktop. Saving does not call external services.
          Use <code>Test Connection</code> to emit a local check event.
        </p>
      </header>

      {toast ? (
        <p
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`ui-toast ${toast.kind === 'error' ? 'ui-toast--error' : 'ui-toast--success'}`}
        >
          {toast.message}
        </p>
      ) : null}

      <div className="provider-page__grid">
        <aside className="ui-card provider-list">
          <div className="provider-list__top">
            <h2>Providers</h2>
            <button type="button" className="ui-button ui-button--ghost" onClick={startCreateFlow}>
              + New
            </button>
          </div>

          {isLoading ? <p className="ui-muted">Loading providers...</p> : null}
          {!isLoading && providers.length === 0 ? (
            <p className="ui-muted">No providers yet. Create one to get started.</p>
          ) : null}

          <div className="provider-list__items">
            {providers.map((provider) => {
              const isActive = provider.id === selectedProviderId
              return (
                <button
                  key={provider.id}
                  type="button"
                  className={`provider-item ${isActive ? 'provider-item--active' : ''}`}
                  onClick={() => {
                    setSelectedProviderId(provider.id)
                    setToast(null)
                  }}
                  disabled={isSubmitting || isTestingConnection}
                >
                  <span className="provider-item__name">{provider.name}</span>
                  <span className="provider-item__meta">
                    {provider.type} / {provider.selectedModel}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="ui-card provider-editor">
          <h2>{selectedProvider ? 'Edit Provider' : 'Create Provider'}</h2>
          <ProvidersForm
            key={selectedProvider?.id ?? 'new-provider'}
            initialValue={toInitialFormValue(selectedProvider)}
            isPrebuilt={Boolean(selectedProvider?.providerModels?.length)}
            isSubmitting={isSubmitting}
            isTestingConnection={isTestingConnection}
            onSubmit={handleSubmit}
            onTestConnection={handleTestConnection}
          />
        </section>
      </div>
    </section>
  )
}

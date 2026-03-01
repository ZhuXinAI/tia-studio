import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createProvider,
  listProviders,
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) {
      return null
    }

    return providers.find((provider) => provider.id === selectedProviderId) ?? null
  }, [providers, selectedProviderId])

  const refreshProviders = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const nextProviders = await listProviders()
      setProviders(nextProviders)
      setSelectedProviderId((currentProviderId) => {
        if (currentProviderId && nextProviders.some((provider) => provider.id === currentProviderId)) {
          return currentProviderId
        }

        return nextProviders.at(0)?.id ?? null
      })
    } catch (error) {
      setLoadError(toErrorMessage(error))
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
        setToast({ kind: 'success', message: 'Provider updated.' })
      } else {
        const createdProvider = await createProvider(values)
        setProviders((currentProviders) => [createdProvider, ...currentProviders])
        setSelectedProviderId(createdProvider.id)
        setToast({ kind: 'success', message: 'Provider created.' })
      }
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const startCreateFlow = () => {
    setSelectedProviderId(null)
    setToast(null)
  }

  return (
    <section style={{ display: 'grid', gap: '16px' }}>
      <h1 style={{ margin: 0 }}>Model Provider Settings</h1>
      <p style={{ margin: 0 }}>
        Configure provider credentials, API host, and one selected model for each provider.
      </p>

      {toast ? (
        <p
          role={toast.kind === 'error' ? 'alert' : 'status'}
          style={{
            margin: 0,
            color: toast.kind === 'error' ? '#ff6b6b' : '#6cd96c',
            border: `1px solid ${toast.kind === 'error' ? '#ff6b6b' : '#6cd96c'}`,
            padding: '8px 12px',
            borderRadius: '8px',
            width: 'fit-content'
          }}
        >
          {toast.message}
        </p>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px minmax(360px, 1fr)',
          gap: '20px',
          alignItems: 'start'
        }}
      >
        <aside style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Providers</h2>
            <button type="button" onClick={startCreateFlow} disabled={isSubmitting}>
              + New
            </button>
          </div>

          {isLoading ? <p style={{ margin: 0 }}>Loading providers...</p> : null}

          {loadError ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              <p style={{ margin: 0, color: '#ff6b6b' }}>{loadError}</p>
              <button type="button" onClick={() => void refreshProviders()}>
                Retry
              </button>
            </div>
          ) : null}

          {!isLoading && providers.length === 0 ? (
            <p style={{ margin: 0 }}>No providers yet. Create one to get started.</p>
          ) : null}

          <div style={{ display: 'grid', gap: '8px' }}>
            {providers.map((provider) => {
              const isActive = provider.id === selectedProviderId
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    setSelectedProviderId(provider.id)
                    setToast(null)
                  }}
                  disabled={isSubmitting}
                  style={{
                    textAlign: 'left',
                    borderRadius: '10px',
                    border: `1px solid ${isActive ? '#6cd96c' : '#3a3a3a'}`,
                    background: isActive ? '#1b261b' : '#0f0f0f',
                    color: '#f8f8f8',
                    padding: '10px 12px'
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{provider.name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    {provider.type} / {provider.selectedModel}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: '12px' }}>
          <h2 style={{ margin: 0 }}>{selectedProvider ? 'Edit Provider' : 'Create Provider'}</h2>
          <ProvidersForm
            key={selectedProvider?.id ?? 'new-provider'}
            initialValue={toInitialFormValue(selectedProvider)}
            isPrebuilt={Boolean(selectedProvider?.providerModels?.length)}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </section>
  )
}

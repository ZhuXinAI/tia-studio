import { ChevronRight, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  createProvider,
  deleteProvider,
  listProviders,
  testProviderConnection,
  updateProvider,
  type ProviderRecord,
  type SaveProviderInput
} from '../providers/providers-query'
import { ProvidersForm } from '../providers/providers-form'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'

type ProviderFormInitialValue = {
  name: string
  type: ProviderRecord['type']
  apiKey: string
  apiHost: string
  selectedModel: string
  providerModelsText: string
}

function toProviderTypeLabel(type: ProviderRecord['type']): string {
  switch (type) {
    case 'openai':
      return 'OpenAI Compatible'
    case 'openai-response':
      return 'OpenAI Responses'
    case 'gemini':
      return 'Gemini'
    case 'anthropic':
      return 'Anthropic'
    case 'ollama':
      return 'Ollama'
    default:
      return type
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length === 0) {
      return 'Unexpected request error'
    }

    try {
      const parsed = JSON.parse(message) as { error?: unknown }
      if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
        return parsed.error
      }
    } catch {
      // keep original message
    }

    return message
  }

  return 'Unexpected request error'
}

function toInitialFormValue(provider: ProviderRecord | null): ProviderFormInitialValue | undefined {
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
  const [providerSearchQuery, setProviderSearchQuery] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [isDeletingProviderId, setIsDeletingProviderId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) {
      return null
    }

    return providers.find((provider) => provider.id === selectedProviderId) ?? null
  }, [providers, selectedProviderId])

  const filteredProviders = useMemo(() => {
    const query = providerSearchQuery.trim().toLowerCase()
    if (query.length === 0) {
      return providers
    }

    return providers.filter((provider) => {
      return [provider.name, provider.selectedModel, toProviderTypeLabel(provider.type)].some(
        (value) => value.toLowerCase().includes(query)
      )
    })
  }, [providerSearchQuery, providers])

  const refreshProviders = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextProviders = await listProviders()
      setProviders(nextProviders)
      setSelectedProviderId((currentProviderId) => {
        if (
          currentProviderId &&
          nextProviders.some((provider) => provider.id === currentProviderId)
        ) {
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

  const closeCreateDialog = (): void => {
    if (isSubmitting || isTestingConnection) {
      return
    }

    setIsCreateDialogOpen(false)
  }

  const handleSaveEditedProvider = async (values: SaveProviderInput): Promise<void> => {
    if (!selectedProvider) {
      toast.error('Provider not found.')
      return
    }

    setIsSubmitting(true)

    try {
      const updatedProvider = await updateProvider(selectedProvider.id, values)
      setProviders((currentProviders) =>
        currentProviders.map((provider) =>
          provider.id === updatedProvider.id ? updatedProvider : provider
        )
      )
      setSelectedProviderId(updatedProvider.id)
      toast.success('Provider saved locally.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateProvider = async (values: SaveProviderInput): Promise<void> => {
    setIsSubmitting(true)

    try {
      const createdProvider = await createProvider(values)
      setProviders((currentProviders) => [createdProvider, ...currentProviders])
      setSelectedProviderId(createdProvider.id)
      setIsCreateDialogOpen(false)
      toast.success('Provider created locally.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTestConnection = async (values: SaveProviderInput): Promise<void> => {
    setIsTestingConnection(true)
    try {
      await testProviderConnection(values)
      toast.success(`Connection successful for ${values.type} (${values.selectedModel}).`)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleDeleteSelectedProvider = async (): Promise<void> => {
    if (!selectedProvider) {
      toast.error('Provider not found.')
      return
    }

    setIsDeletingProviderId(selectedProvider.id)

    try {
      await deleteProvider(selectedProvider.id)
      setProviders((currentProviders) => {
        const nextProviders = currentProviders.filter((item) => item.id !== selectedProvider.id)
        setSelectedProviderId((currentProviderId) => {
          if (currentProviderId !== selectedProvider.id) {
            return currentProviderId
          }

          return nextProviders.at(0)?.id ?? null
        })

        return nextProviders
      })
      toast.success('Provider deleted.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsDeletingProviderId(null)
    }
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col" style={{ marginLeft: -32, marginRight: -32 }}>
        <div className="min-h-0 flex flex-1">
          <aside className="flex h-full min-h-0 w-[360px] flex-col overflow-hidden border-r border-r-border/70 bg-card shadow-xs">
            <div className="border-r-border/70 flex items-center justify-between px-4 py-3">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                PROVIDERS
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-base font-medium text-primary hover:bg-transparent hover:text-primary/80"
                onClick={() => {
                  setIsCreateDialogOpen(true)
                }}
              >
                + New
              </Button>
            </div>

            <div className="border-border/70 border-b px-3 py-3">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  data-provider-search-input
                  placeholder="Search providers..."
                  className="h-9 pl-9"
                  value={providerSearchQuery}
                  onChange={(event) => setProviderSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">Loading providers...</p>
              ) : null}
              {!isLoading && providers.length === 0 ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">
                  No providers yet. Create one to get started.
                </p>
              ) : null}
              {!isLoading && providers.length > 0 && filteredProviders.length === 0 ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">
                  No providers match your search.
                </p>
              ) : null}

              {filteredProviders.map((provider, index) => {
                const isActive = provider.id === selectedProviderId
                return (
                  <button
                    key={provider.id}
                    type="button"
                    data-provider-row={provider.id}
                    className={cn(
                      'group flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
                      index > 0 ? 'border-border/60 border-t' : '',
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
                    )}
                    onClick={() => {
                      setSelectedProviderId(provider.id)
                    }}
                    disabled={isSubmitting || isTestingConnection || Boolean(isDeletingProviderId)}
                  >
                    <div>
                      <p className="text-base font-semibold">{provider.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {toProviderTypeLabel(provider.type)} / {provider.selectedModel}
                      </p>
                    </div>
                    <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
                  </button>
                )
              })}
            </div>
          </aside>

          <Card className="rounded-none border-none flex h-full min-h-0 flex-1 flex-col bg-card/85 shadow-xs">
            <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-4 pt-1">
              {selectedProvider ? (
                <div className="space-y-4">
                  <ProvidersForm
                    key={selectedProvider.id}
                    initialValue={toInitialFormValue(selectedProvider)}
                    isPrebuilt={Boolean(selectedProvider.providerModels?.length)}
                    isSubmitting={isSubmitting}
                    isTestingConnection={isTestingConnection}
                    onSubmit={handleSaveEditedProvider}
                    onTestConnection={handleTestConnection}
                  />
                  <div className="border-border/70 flex justify-end border-t pt-4">
                    <Button
                      type="button"
                      variant="destructive"
                      aria-label={`Delete provider ${selectedProvider.name}`}
                      onClick={() => {
                        void handleDeleteSelectedProvider()
                      }}
                      disabled={
                        isSubmitting ||
                        isTestingConnection ||
                        isDeletingProviderId === selectedProvider.id
                      }
                    >
                      <Trash2 className="size-4" />
                      {isDeletingProviderId === selectedProvider.id
                        ? 'Deleting...'
                        : 'Delete Provider'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Select a provider in the sidebar to edit its model configuration.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isCreateDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close provider dialog"
            className="bg-background/80 absolute inset-0 backdrop-blur-sm"
            onClick={closeCreateDialog}
            disabled={isSubmitting || isTestingConnection}
          />
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-provider-title"
            className="relative z-10 w-full max-w-4xl gap-4 py-5"
          >
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle id="create-provider-title">New Model Provider</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Create a provider profile and save credentials locally.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeCreateDialog}
                  disabled={isSubmitting || isTestingConnection}
                  aria-label="Close dialog"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ProvidersForm
                key="new-provider"
                isSubmitting={isSubmitting}
                isTestingConnection={isTestingConnection}
                onSubmit={handleCreateProvider}
                onTestConnection={handleTestConnection}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
}

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  BookOpen,
  Bot,
  Brain,
  Cloud,
  Database,
  FileSearch,
  Info,
  Keyboard,
  Monitor,
  MousePointer2,
  Search,
  ServerCog,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Zap
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
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
import { Button, buttonVariants } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'

type ToastState = {
  kind: 'success' | 'error'
  message: string
}

type SettingsNavItem = {
  title: string
  icon: ComponentType<{ className?: string }>
  to?: string
}

type SettingsNavGroup = {
  label: string
  items: SettingsNavItem[]
}

const settingsNavGroups: SettingsNavGroup[] = [
  {
    label: 'Models',
    items: [
      {
        title: 'Model Provider',
        icon: Cloud,
        to: '/settings/providers'
      },
      {
        title: 'Default Model',
        icon: Bot
      }
    ]
  },
  {
    label: 'Preferences',
    items: [
      {
        title: 'General Settings',
        icon: SlidersHorizontal
      },
      {
        title: 'Display Settings',
        icon: Monitor
      },
      {
        title: 'Data Settings',
        icon: Database
      }
    ]
  },
  {
    label: 'Tools',
    items: [
      {
        title: 'MCP Servers',
        icon: Zap
      },
      {
        title: 'Web Search',
        icon: Search
      },
      {
        title: 'Memories',
        icon: Brain
      },
      {
        title: 'API Server',
        icon: ServerCog
      },
      {
        title: 'Document Processing',
        icon: FileSearch
      },
      {
        title: 'Quick Phrases',
        icon: BookOpen
      },
      {
        title: 'Keyboard Shortcuts',
        icon: Keyboard
      },
      {
        title: 'Quick Assistant',
        icon: Settings2
      },
      {
        title: 'Selection Assistant',
        icon: MousePointer2
      },
      {
        title: 'About & Feedback',
        icon: Info
      }
    ]
  }
]

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
  const [isDeletingProviderId, setIsDeletingProviderId] = useState<string | null>(null)
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
        message: `Connection successful for ${values.type} (${values.selectedModel}).`
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

  const handleDeleteProvider = async (provider: ProviderRecord) => {
    setIsDeletingProviderId(provider.id)
    setToast(null)
    try {
      await deleteProvider(provider.id)
      setProviders((currentProviders) => {
        const nextProviders = currentProviders.filter((item) => item.id !== provider.id)
        setSelectedProviderId((currentProviderId) => {
          if (currentProviderId !== provider.id) {
            return currentProviderId
          }

          return nextProviders.at(0)?.id ?? null
        })
        return nextProviders
      })
      setToast({ kind: 'success', message: 'Provider deleted.' })
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsDeletingProviderId(null)
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
      <aside className="lg:sticky lg:top-18 lg:self-start">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle>Settings</CardTitle>
            <CardDescription>Configuration categories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsNavGroups.map((group) => (
              <section key={group.label} className="space-y-1">
                <h2 className="text-muted-foreground px-2 text-xs font-semibold tracking-wide uppercase">
                  {group.label}
                </h2>
                {group.items.map((item) => {
                  if (item.to) {
                    return (
                      <NavLink
                        key={item.title}
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }),
                            'w-full justify-start'
                          )
                        }
                      >
                        <item.icon className="size-4" />
                        {item.title}
                      </NavLink>
                    )
                  }

                  return (
                    <div
                      key={item.title}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'sm' }),
                        'pointer-events-none w-full justify-start opacity-65'
                      )}
                    >
                      <item.icon className="size-4" />
                      {item.title}
                    </div>
                  )
                })}
              </section>
            ))}
          </CardContent>
        </Card>
      </aside>

      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Model Provider Settings</h1>
          <p className="text-muted-foreground text-sm">
            Stored offline on this desktop. Saving does not call external services. Use{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Test Connection</code> to run a live
            provider check.
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

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
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
                  const isDeleting = isDeletingProviderId === provider.id
                  return (
                    <div key={provider.id} className="flex items-start gap-2">
                      <button
                        type="button"
                        className={cn(
                          'flex-1 rounded-md border px-3 py-2 text-left transition-colors',
                          isActive
                            ? 'border-primary/80 bg-primary/10'
                            : 'border-border/70 bg-card/60 hover:bg-accent/30'
                        )}
                        onClick={() => {
                          setSelectedProviderId(provider.id)
                          setToast(null)
                        }}
                        disabled={isSubmitting || isTestingConnection || Boolean(isDeletingProviderId)}
                      >
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {provider.type} / {provider.selectedModel}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="border-border/60 hover:bg-destructive/10 hover:text-destructive border"
                        aria-label={`Delete provider ${provider.name}`}
                        disabled={isSubmitting || isTestingConnection || Boolean(isDeletingProviderId)}
                        onClick={() => void handleDeleteProvider(provider)}
                      >
                        {isDeleting ? <span className="text-xs">...</span> : <Trash2 className="size-4" />}
                      </Button>
                    </div>
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
      </div>
    </section>
  )
}

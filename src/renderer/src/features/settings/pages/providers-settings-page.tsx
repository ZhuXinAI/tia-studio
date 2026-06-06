import { Check, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { toast } from 'sonner'
import {
  createProvider,
  deleteProvider,
  listProviders,
  providerKeys,
  testProviderConnection,
  updateProvider,
  type ProviderRecord,
  type SaveProviderInput
} from '../providers/providers-query'
import { queryClient } from '../../../lib/query-client'
import { ProvidersForm } from '../providers/providers-form'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { cn } from '../../../lib/utils'
import minimaxLogo from '../../../assets/providers/minimax.png'
import glmLogo from '../../../assets/providers/glm.png'
import ollamaLogo from '../../../assets/providers/ollama.png'
import openaiLogo from '../../../assets/providers/openai.png'
import anthropicLogo from '../../../assets/providers/anthropic.png'
import geminiLogo from '../../../assets/providers/gemini.png'
import kimiLogo from '../../../assets/providers/kimi.png'

type ProviderFormInitialValue = {
  name: string
  type: ProviderRecord['type']
  apiKey: string
  apiHost: string
  selectedModel: string
  providerModelsText: string
  supportsVision: boolean
  enabled: boolean
}

function toProviderTypeLabel(type: ProviderRecord['type'], t: (key: string) => string): string {
  switch (type) {
    case 'openai':
      return t('settings.providers.typeLabels.openai')
    case 'openai-response':
      return t('settings.providers.typeLabels.openai-response')
    case 'openrouter':
      return t('settings.providers.typeLabels.openrouter')
    case 'gemini':
      return t('settings.providers.typeLabels.gemini')
    case 'anthropic':
      return t('settings.providers.typeLabels.anthropic')
    case 'ollama':
      return t('settings.providers.typeLabels.ollama')
    case 'codex-acp':
      return t('settings.providers.typeLabels.codex-acp')
    case 'claude-agent-acp':
      return t('settings.providers.typeLabels.claude-agent-acp')
    default:
      return type
  }
}

function getProviderAvatarPath(icon: string | null): string | null {
  if (!icon) {
    return null
  }

  // Map icon names to imported image modules
  const iconMap: Record<string, string> = {
    minimax: minimaxLogo,
    glm: glmLogo,
    ollama: ollamaLogo,
    openai: openaiLogo,
    anthropic: anthropicLogo,
    gemini: geminiLogo,
    kimi: kimiLogo
  }

  return iconMap[icon] || null
}

function getProviderInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function toErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length === 0) {
      return t('settings.providers.toasts.unexpectedError')
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

  return t('settings.providers.toasts.unexpectedError')
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
    providerModelsText: provider.providerModels?.join('\n') ?? '',
    supportsVision: provider.supportsVision,
    enabled: provider.enabled
  }
}

export function ProvidersSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
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
    let filtered = providers

    if (query.length > 0) {
      filtered = providers.filter((provider) => {
        return [provider.name, provider.selectedModel, toProviderTypeLabel(provider.type, t)].some(
          (value) => value.toLowerCase().includes(query)
        )
      })
    }

    // Sort: enabled first, then alphabetically by name
    return filtered.sort((a, b) => {
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }, [providerSearchQuery, providers, t])

  const refreshProviders = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextProviders = await listProviders()
      queryClient.setQueryData(providerKeys.lists(), nextProviders)
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

  const handleSaveEditedProvider = async (
    values: SaveProviderInput,
    onSuccess?: () => void
  ): Promise<void> => {
    if (!selectedProvider) {
      toast.error(t('settings.providers.toasts.providerNotFound'))
      return
    }

    setIsSubmitting(true)

    try {
      const updatedProvider = await updateProvider(selectedProvider.id, {
        ...values,
        enabled: true
      })
      setProviders((currentProviders) => {
        const nextProviders = currentProviders.map((provider) =>
          provider.id === updatedProvider.id ? updatedProvider : provider
        )
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        return nextProviders
      })
      setSelectedProviderId(updatedProvider.id)
      toast.success(t('settings.providers.toasts.providerSaved'))
      onSuccess?.()
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateProvider = async (values: SaveProviderInput): Promise<void> => {
    setIsSubmitting(true)

    try {
      const createdProvider = await createProvider(values)
      setProviders((currentProviders) => {
        const nextProviders = [createdProvider, ...currentProviders]
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        return nextProviders
      })
      setSelectedProviderId(createdProvider.id)
      setIsCreateDialogOpen(false)
      toast.success(t('settings.providers.toasts.providerCreated'))
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTestConnection = async (values: SaveProviderInput): Promise<void> => {
    setIsTestingConnection(true)
    try {
      await testProviderConnection(values)
      toast.success(
        t('settings.providers.toasts.connectionSuccess', {
          type: values.type,
          model: values.selectedModel
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleDeleteSelectedProvider = async (): Promise<void> => {
    if (!selectedProvider) {
      toast.error(t('settings.providers.toasts.providerNotFound'))
      return
    }

    if (selectedProvider.isBuiltIn) {
      toast.error(t('settings.providers.toasts.builtInDeleteBlocked'))
      return
    }

    setIsDeletingProviderId(selectedProvider.id)

    try {
      await deleteProvider(selectedProvider.id)
      setProviders((currentProviders) => {
        const nextProviders = currentProviders.filter((item) => item.id !== selectedProvider.id)
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        setSelectedProviderId((currentProviderId) => {
          if (currentProviderId !== selectedProvider.id) {
            return currentProviderId
          }

          return nextProviders.at(0)?.id ?? null
        })

        return nextProviders
      })
      toast.success(t('settings.providers.toasts.providerDeleted'))
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsDeletingProviderId(null)
    }
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col py-8" style={{ marginLeft: -32, marginRight: -32 }}>
        <div className="min-h-0 flex flex-1 overflow-hidden rounded-[1.75rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] shadow-[var(--surface-shadow)]">
          <aside className="flex h-full min-h-0 w-[360px] flex-col overflow-hidden border-r border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_58%,transparent))]">
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--surface-border)] px-5 py-5">
              <div className="space-y-2">
                <p className="section-kicker">Model catalog</p>
                <h2 className="font-editorial text-[1.55rem] leading-none tracking-[-0.03em]">
                  {t('settings.providers.sidebarTitle')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Local provider profiles for Chats and workspace drafting.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 shrink-0"
                onClick={() => {
                  setIsCreateDialogOpen(true)
                }}
              >
                {t('settings.providers.newButton')}
              </Button>
            </div>

            <div className="border-b border-[color:var(--surface-border)] px-4 py-4">
              <div className="relative rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-1 py-1 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input
                  data-provider-search-input
                  placeholder={t('settings.providers.searchPlaceholder')}
                  className="h-10 border-none bg-transparent pl-9 shadow-none focus-visible:ring-0"
                  value={providerSearchQuery}
                  onChange={(event) => setProviderSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {isLoading ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  {t('settings.providers.loading')}
                </p>
              ) : null}
              {!isLoading && providers.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  {t('settings.providers.empty')}
                </p>
              ) : null}
              {!isLoading && providers.length > 0 && filteredProviders.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  {t('settings.providers.emptySearch')}
                </p>
              ) : null}

              <div className="space-y-2">
                {filteredProviders.map((provider) => {
                  const isActive = provider.id === selectedProviderId
                  const avatarPath = getProviderAvatarPath(provider.icon)
                  const initials = getProviderInitials(provider.name)

                  return (
                    <button
                      key={provider.id}
                      type="button"
                      data-provider-row={provider.id}
                      className={cn(
                        'group flex w-full items-start justify-between gap-3 rounded-[1rem] border px-4 py-3 text-left transition-colors',
                        isActive
                          ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] text-foreground shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                          : 'border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] hover:bg-[color:var(--surface-muted)]'
                      )}
                      onClick={() => {
                        setSelectedProviderId(provider.id)
                      }}
                      disabled={isSubmitting || isTestingConnection || Boolean(isDeletingProviderId)}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          {avatarPath ? <AvatarImage src={avatarPath} alt={provider.name} /> : null}
                          <AvatarFallback className="text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <p className="text-base font-semibold">{provider.name}</p>
                          <p className="text-muted-foreground text-sm">
                            {toProviderTypeLabel(provider.type, t)} / {provider.selectedModel}
                          </p>
                        </div>
                      </div>
                      {provider.enabled ? (
                        <Check className="text-primary mt-1 size-4 shrink-0" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          <Card className="rounded-none border-none flex h-full min-h-0 flex-1 flex-col bg-transparent py-0 shadow-none">
            <CardHeader className="border-b border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_90%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_54%,transparent))] py-5">
              <div className="space-y-2">
                <p className="section-kicker">Credential editing</p>
                <CardTitle className="font-editorial text-[1.9rem] leading-none tracking-[-0.03em]">
                  {selectedProvider?.name ?? 'Provider details'}
                </CardTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {selectedProvider
                    ? 'Adjust model routing, credentials, and capability flags without leaving this workspace-first shell.'
                    : t('settings.providers.selectPrompt')}
                </p>
              </div>
            </CardHeader>

            <CardContent className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {selectedProvider ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3">
                    <div className="space-y-1">
                      <p className="section-kicker text-[0.66rem]">Provider type</p>
                      <p className="font-editorial text-[1.25rem] leading-none tracking-[-0.02em]">
                        {toProviderTypeLabel(selectedProvider.type, t)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Current model: {selectedProvider.selectedModel}
                      </p>
                    </div>
                    {selectedProvider.enabled ? (
                      <span className="text-primary inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-1 text-xs font-medium">
                        Enabled
                      </span>
                    ) : null}
                  </div>

                  {selectedProvider.isBuiltIn && selectedProvider.officialSite ? (
                    <div className="rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] p-4">
                      <p className="text-sm text-muted-foreground">
                        {t('settings.providers.builtInProvider')}{' '}
                        <a
                          href={selectedProvider.officialSite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {t('settings.providers.visitOfficialSite')}
                        </a>
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] p-5">
                    <ProvidersForm
                      key={selectedProvider.id}
                      initialValue={toInitialFormValue(selectedProvider)}
                      isPrebuilt={Boolean(selectedProvider.providerModels?.length)}
                      isBuiltIn={selectedProvider.isBuiltIn}
                      isSubmitting={isSubmitting}
                      isTestingConnection={isTestingConnection}
                      onSubmit={handleSaveEditedProvider}
                      onTestConnection={handleTestConnection}
                    />
                  </div>

                  {!selectedProvider.isBuiltIn ? (
                    <div className="flex justify-end border-t border-[color:var(--surface-border)] pt-4">
                      <Button
                        type="button"
                        variant="destructive"
                        aria-label={t('settings.providers.deleteAriaLabel', {
                          name: selectedProvider.name
                        })}
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
                          ? t('settings.providers.deletingButton')
                          : t('settings.providers.deleteButton')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t('settings.providers.selectPrompt')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsCreateDialogOpen(true)
            return
          }

          closeCreateDialog()
        }}
      >
        <DialogContent className="max-w-4xl gap-5">
          <DialogHeader className="space-y-2">
            <p className="section-kicker">New credential set</p>
            <DialogTitle>{t('settings.providers.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.providers.createDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_70%,transparent))] p-4">
            <ProvidersForm
              key="new-provider"
              isSubmitting={isSubmitting}
              isTestingConnection={isTestingConnection}
              onSubmit={handleCreateProvider}
              onTestConnection={handleTestConnection}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { Check, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react'
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
  selectedModelContextWindowTokensText: string
  providerModelsText: string
  supportsVision: boolean
  enabled: boolean
  isDefault: boolean
}

type CreateProviderMode = 'preset' | 'custom'

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

function isVisibleProvider(provider: ProviderRecord): boolean {
  return provider.isAdded !== false
}

function sortProviders(providers: ProviderRecord[]): ProviderRecord[] {
  return [...providers].sort((left, right) => {
    if (Boolean(left.isDefault) !== Boolean(right.isDefault)) {
      return left.isDefault ? -1 : 1
    }

    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
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
    selectedModelContextWindowTokensText:
      provider.selectedModelContextWindowTokens?.toString() ?? '',
    providerModelsText: provider.providerModels?.join('\n') ?? '',
    supportsVision: provider.supportsVision,
    enabled: provider.enabled,
    isDefault: provider.isDefault === true
  }
}

function toPresetFormValue(provider: ProviderRecord | null): ProviderFormInitialValue | undefined {
  if (!provider) {
    return undefined
  }

  return {
    name: provider.name,
    type: provider.type,
    apiKey: provider.apiKey,
    apiHost: provider.apiHost ?? '',
    selectedModel: provider.selectedModel,
    selectedModelContextWindowTokensText:
      provider.selectedModelContextWindowTokens?.toString() ?? '',
    providerModelsText: provider.providerModels?.join('\n') ?? '',
    supportsVision: provider.supportsVision,
    enabled: true,
    isDefault: false
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
  const [createMode, setCreateMode] = useState<CreateProviderMode>('preset')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  const visibleProviders = useMemo(
    () => sortProviders(providers.filter((provider) => isVisibleProvider(provider))),
    [providers]
  )
  const presetProviders = useMemo(
    () => sortProviders(providers.filter((provider) => provider.isBuiltIn)),
    [providers]
  )
  const availablePresetProviders = useMemo(
    () => presetProviders.filter((provider) => !provider.isAdded),
    [presetProviders]
  )

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) {
      return null
    }

    return visibleProviders.find((provider) => provider.id === selectedProviderId) ?? null
  }, [selectedProviderId, visibleProviders])

  const filteredProviders = useMemo(() => {
    const query = providerSearchQuery.trim().toLowerCase()
    if (query.length === 0) {
      return visibleProviders
    }

    return visibleProviders.filter((provider) => {
      return [provider.name, provider.selectedModel, toProviderTypeLabel(provider.type, t)].some(
        (value) => value.toLowerCase().includes(query)
      )
    })
  }, [providerSearchQuery, t, visibleProviders])

  const selectedPresetProvider = useMemo(() => {
    if (!selectedPresetId) {
      return availablePresetProviders.at(0) ?? null
    }

    return availablePresetProviders.find((provider) => provider.id === selectedPresetId) ?? null
  }, [availablePresetProviders, selectedPresetId])

  const syncProviders = useCallback((nextProviders: ProviderRecord[]): void => {
    queryClient.setQueryData(providerKeys.lists(), nextProviders)
    setProviders(nextProviders)
  }, [])

  const refreshProviders = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextProviders = await listProviders()
      const nextVisibleProviders = sortProviders(
        nextProviders.filter((provider) => isVisibleProvider(provider))
      )
      syncProviders(nextProviders)
      setSelectedProviderId((currentProviderId) => {
        if (
          currentProviderId &&
          nextVisibleProviders.some((provider) => provider.id === currentProviderId)
        ) {
          return currentProviderId
        }

        return nextVisibleProviders.at(0)?.id ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [syncProviders])

  useEffect(() => {
    void refreshProviders()
  }, [refreshProviders])

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return
    }

    if (createMode === 'preset' && availablePresetProviders.length === 0) {
      setCreateMode('custom')
      setSelectedPresetId(null)
      return
    }

    if (
      createMode === 'preset' &&
      !availablePresetProviders.some((provider) => provider.id === selectedPresetId)
    ) {
      setSelectedPresetId(availablePresetProviders.at(0)?.id ?? null)
    }
  }, [availablePresetProviders, createMode, isCreateDialogOpen, selectedPresetId])

  const openCreateDialog = (): void => {
    setCreateMode(availablePresetProviders.length > 0 ? 'preset' : 'custom')
    setSelectedPresetId(availablePresetProviders.at(0)?.id ?? null)
    setIsCreateDialogOpen(true)
  }

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
      const updatedProvider = await updateProvider(selectedProvider.id, values)
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
      const createdProvider = await createProvider({
        ...values,
        isAdded: true
      })
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

  const handleAddPresetProvider = async (values: SaveProviderInput): Promise<void> => {
    if (!selectedPresetProvider) {
      toast.error(t('settings.providers.toasts.providerNotFound'))
      return
    }

    setIsSubmitting(true)

    try {
      const updatedProvider = await updateProvider(selectedPresetProvider.id, {
        ...values,
        isAdded: true
      })
      setProviders((currentProviders) => {
        const nextProviders = currentProviders.map((provider) =>
          provider.id === updatedProvider.id ? updatedProvider : provider
        )
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        return nextProviders
      })
      setSelectedProviderId(updatedProvider.id)
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

    setIsDeletingProviderId(selectedProvider.id)

    try {
      await deleteProvider(selectedProvider.id)
      setProviders((currentProviders) => {
        const nextProviders = selectedProvider.isBuiltIn
          ? currentProviders.map((provider) =>
              provider.id === selectedProvider.id
                ? {
                    ...provider,
                    enabled: false,
                    isAdded: false,
                    isDefault: false
                  }
                : provider
            )
          : currentProviders.filter((item) => item.id !== selectedProvider.id)
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        const nextVisibleProviders = sortProviders(
          nextProviders.filter((provider) => isVisibleProvider(provider))
        )
        setSelectedProviderId((currentProviderId) => {
          if (currentProviderId !== selectedProvider.id) {
            return currentProviderId
          }

          return nextVisibleProviders.at(0)?.id ?? null
        })

        return nextProviders
      })
      toast.success(
        selectedProvider.isBuiltIn
          ? 'Provider removed from Added providers.'
          : t('settings.providers.toasts.providerDeleted')
      )
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsDeletingProviderId(null)
    }
  }

  return (
    <>
      <div
        className="flex h-full min-h-0 flex-col py-8"
        style={{ marginLeft: -32, marginRight: -32 }}
      >
        <div className="min-h-0 flex flex-1 overflow-hidden">
          <aside className="flex h-full min-h-0 w-[360px] flex-col overflow-hidden border-r border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_58%,transparent))]">
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--surface-border)] px-5 py-5">
              <div className="space-y-1">
                <h2 className="font-editorial text-[1.55rem] leading-none tracking-[-0.03em]">
                  Added providers
                </h2>
                <p className="text-sm text-muted-foreground">
                  {visibleProviders.length} saved{' '}
                  {visibleProviders.length === 1 ? 'provider' : 'providers'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 shrink-0"
                onClick={openCreateDialog}
              >
                <Plus className="size-4" />
                Add Provider
              </Button>
            </div>

            <div className="border-b border-[color:var(--surface-border)] px-4 py-4">
              <div className="relative rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-1 py-1 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  {t('settings.providers.loading')}
                </p>
              ) : null}
              {!isLoading && visibleProviders.length === 0 ? (
                <div className="space-y-3 px-2 py-3 text-sm text-muted-foreground">
                  <p>{t('settings.providers.empty')}</p>
                  <Button type="button" variant="outline" size="sm" onClick={openCreateDialog}>
                    <Plus className="size-4" />
                    Add your first provider
                  </Button>
                </div>
              ) : null}
              {!isLoading && visibleProviders.length > 0 && filteredProviders.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">
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
                      disabled={
                        isSubmitting || isTestingConnection || Boolean(isDeletingProviderId)
                      }
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          {avatarPath ? <AvatarImage src={avatarPath} alt={provider.name} /> : null}
                          <AvatarFallback className="text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold">{provider.name}</p>
                            {provider.isDefault ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-2 py-0.5 text-[10px] font-medium text-foreground">
                                <Star className="size-3" />
                                Default
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {toProviderTypeLabel(provider.type, t)} / {provider.selectedModel}
                          </p>
                        </div>
                      </div>
                      {provider.enabled ? (
                        <Check className="mt-1 size-4 shrink-0 text-primary" />
                      ) : (
                        <span className="mt-1 rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          <Card className="flex h-full min-h-0 flex-1 flex-col rounded-none border-none bg-transparent py-0 shadow-none">
            <CardHeader className="border-b border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_90%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_54%,transparent))] py-5">
              <div className="space-y-2">
                <CardTitle className="font-editorial text-[1.9rem] leading-none tracking-[-0.03em]">
                  {selectedProvider?.name ?? 'Provider details'}
                </CardTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {selectedProvider
                    ? 'Update credentials, model routing, and default behavior without leaving this shell.'
                    : 'Add a preset or custom provider to make it available for new chats.'}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-1 text-xs font-medium text-foreground">
                        {selectedProvider.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {selectedProvider.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-1 text-xs font-medium text-foreground">
                          <Star className="size-3.5" />
                          Default
                        </span>
                      ) : null}
                    </div>
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
                        : selectedProvider.isBuiltIn
                          ? 'Remove Provider'
                          : t('settings.providers.deleteButton')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-full items-center justify-center">
                  <div className="space-y-4 rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_68%,transparent))] px-8 py-8 text-center">
                    <div className="mx-auto grid size-12 place-items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)]">
                      <Sparkles className="size-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-editorial text-[1.4rem] leading-none tracking-[-0.02em]">
                        No provider selected
                      </p>
                      <p className="max-w-md text-sm text-muted-foreground">
                        Add a preset or custom provider, then pick the one you want to manage.
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={openCreateDialog}>
                      <Plus className="size-4" />
                      Add Provider
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            openCreateDialog()
            return
          }

          closeCreateDialog()
        }}
      >
        <DialogContent className="flex max-h-[80vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-2 border-b border-[color:var(--surface-border)] px-6 py-5">
            <p className="section-kicker">New credential set</p>
            <DialogTitle>{t('settings.providers.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.providers.createDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div
            data-provider-create-dialog-body="true"
            className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          >
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-4">
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-[1.1rem] border px-4 py-4 text-left transition-colors',
                    createMode === 'custom'
                      ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                      : 'border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] hover:bg-[color:var(--surface-muted)]'
                  )}
                  onClick={() => {
                    setCreateMode('custom')
                  }}
                >
                  <p className="font-editorial text-[1.2rem] leading-none tracking-[-0.02em]">
                    Custom provider
                  </p>
                  <p className="pt-2 text-sm text-muted-foreground">
                    Start from scratch with your own provider name, type, and endpoint.
                  </p>
                </button>

                <div className="space-y-2">
                  <p className="section-kicker">Presets</p>
                  {availablePresetProviders.length > 0 ? (
                    availablePresetProviders.map((provider) => {
                      const avatarPath = getProviderAvatarPath(provider.icon)
                      const initials = getProviderInitials(provider.name)
                      const isActive =
                        createMode === 'preset' && selectedPresetProvider?.id === provider.id

                      return (
                        <button
                          key={provider.id}
                          type="button"
                          className={cn(
                            'flex w-full items-start gap-3 rounded-[1rem] border px-4 py-3 text-left transition-colors',
                            isActive
                              ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                              : 'border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] hover:bg-[color:var(--surface-muted)]'
                          )}
                          onClick={() => {
                            setCreateMode('preset')
                            setSelectedPresetId(provider.id)
                          }}
                        >
                          <Avatar className="h-10 w-10 shrink-0">
                            {avatarPath ? (
                              <AvatarImage src={avatarPath} alt={provider.name} />
                            ) : null}
                            <AvatarFallback className="text-xs font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{provider.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {provider.selectedModel}
                            </p>
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <p className="rounded-[1rem] border border-dashed border-[color:var(--surface-border)] px-4 py-4 text-sm text-muted-foreground">
                      All preset providers are already added. Create a custom provider if you need
                      another profile.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_70%,transparent))] p-4">
                {createMode === 'custom' || !selectedPresetProvider ? (
                  <ProvidersForm
                    key="new-provider"
                    isSubmitting={isSubmitting}
                    isTestingConnection={isTestingConnection}
                    stickyActions
                    onSubmit={handleCreateProvider}
                    onTestConnection={handleTestConnection}
                  />
                ) : (
                  <ProvidersForm
                    key={selectedPresetProvider.id}
                    initialValue={toPresetFormValue(selectedPresetProvider)}
                    isPrebuilt={Boolean(selectedPresetProvider.providerModels?.length)}
                    isBuiltIn
                    isSubmitting={isSubmitting}
                    isTestingConnection={isTestingConnection}
                    stickyActions
                    onSubmit={handleAddPresetProvider}
                    onTestConnection={handleTestConnection}
                  />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

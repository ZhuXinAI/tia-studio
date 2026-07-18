import { Check, ChevronDown, ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../../components/ui/dropdown-menu'
import anthropicLogo from '../../../assets/providers/anthropic.png'
import geminiLogo from '../../../assets/providers/gemini.png'
import glmLogo from '../../../assets/providers/glm.png'
import kimiLogo from '../../../assets/providers/kimi.png'
import minimaxLogo from '../../../assets/providers/minimax.png'
import ollamaLogo from '../../../assets/providers/ollama.png'
import openaiLogo from '../../../assets/providers/openai.png'
import { useTranslation } from '../../../i18n/use-app-translation'
import { queryClient } from '../../../lib/query-client'
import { cn } from '../../../lib/utils'
import { ProvidersForm, SAVED_API_KEY_MASK } from '../providers/providers-form'
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

type DialogMode = 'create' | 'edit' | null

const providerLogos: Record<string, string> = {
  minimax: minimaxLogo,
  glm: glmLogo,
  ollama: ollamaLogo,
  openai: openaiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  kimi: kimiLogo
}

function toProviderTypeLabel(type: ProviderRecord['type'], t: (key: string) => string): string {
  return t(`settings.providers.typeLabels.${type}`)
}

function getProviderInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function sortProviders(providers: ProviderRecord[]): ProviderRecord[] {
  return [...providers].sort((left, right) => {
    if (Boolean(left.isDefault) !== Boolean(right.isDefault)) {
      return left.isDefault ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

function toInitialFormValue(provider: ProviderRecord | null): ProviderFormInitialValue | undefined {
  if (!provider) return undefined

  return {
    name: provider.name,
    type: provider.type,
    apiKey: provider.hasApiKey ? SAVED_API_KEY_MASK : provider.apiKey,
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
  const value = toInitialFormValue(provider)
  return value ? { ...value, enabled: true, isDefault: false } : undefined
}

function toErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!(error instanceof Error) || error.message.trim().length === 0) {
    return t('settings.providers.toasts.unexpectedError')
  }

  try {
    const parsed = JSON.parse(error.message) as { error?: unknown }
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error
  } catch {
    // The original message is already user-readable.
  }
  return error.message
}

function ProviderAvatar({ provider, className }: { provider: ProviderRecord; className?: string }) {
  const logo = provider.icon ? providerLogos[provider.icon] : null
  return (
    <Avatar className={cn('size-10 shrink-0 rounded-lg', className)}>
      {logo ? <AvatarImage src={logo} alt={provider.name} /> : null}
      <AvatarFallback className="rounded-lg text-xs font-semibold">
        {getProviderInitials(provider.name)}
      </AvatarFallback>
    </Avatar>
  )
}

export function ProvidersSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [isDeletingProviderId, setIsDeletingProviderId] = useState<string | null>(null)

  const savedProviders = useMemo(
    () => sortProviders(providers.filter((provider) => provider.isAdded !== false)),
    [providers]
  )
  const availablePresets = useMemo(
    () => sortProviders(providers.filter((provider) => provider.isBuiltIn && !provider.isAdded)),
    [providers]
  )
  const activeProvider = useMemo(
    () => savedProviders.find((provider) => provider.id === activeProviderId) ?? null,
    [activeProviderId, savedProviders]
  )
  const selectedPreset = useMemo(
    () => availablePresets.find((provider) => provider.id === selectedPresetId) ?? null,
    [availablePresets, selectedPresetId]
  )

  const syncProviders = useCallback((nextProviders: ProviderRecord[]) => {
    queryClient.setQueryData(providerKeys.lists(), nextProviders)
    setProviders(nextProviders)
  }, [])

  useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        syncProviders(await listProviders())
      } catch (error) {
        toast.error(toErrorMessage(error, t))
      } finally {
        setIsLoading(false)
      }
    })()
  }, [syncProviders, t])

  const closeDialog = (): void => {
    if (isSubmitting || isTestingConnection) return
    setDialogMode(null)
    setActiveProviderId(null)
    setSelectedPresetId(null)
  }

  const dismissDialogAfterSave = (): void => {
    setDialogMode(null)
    setActiveProviderId(null)
    setSelectedPresetId(null)
  }

  const openCreateDialog = (): void => {
    setActiveProviderId(null)
    setSelectedPresetId(availablePresets.at(0)?.id ?? null)
    setDialogMode('create')
  }

  const openEditDialog = (providerId: string): void => {
    setSelectedPresetId(null)
    setActiveProviderId(providerId)
    setDialogMode('edit')
  }

  const replaceProvider = (updatedProvider: ProviderRecord): void => {
    setProviders((current) => {
      const next = current.map((provider) =>
        provider.id === updatedProvider.id ? updatedProvider : provider
      )
      queryClient.setQueryData(providerKeys.lists(), next)
      return next
    })
  }

  const handleSaveEditedProvider = async (values: SaveProviderInput): Promise<void> => {
    if (!activeProvider) return
    setIsSubmitting(true)
    try {
      replaceProvider(
        await updateProvider(activeProvider.id, {
          ...values,
          apiKey: values.apiKey === SAVED_API_KEY_MASK ? '' : values.apiKey
        })
      )
      toast.success(t('settings.providers.toasts.providerSaved'))
      dismissDialogAfterSave()
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateProvider = async (values: SaveProviderInput): Promise<void> => {
    setIsSubmitting(true)
    try {
      const created = await createProvider({ ...values, isAdded: true })
      syncProviders([created, ...providers])
      toast.success(t('settings.providers.toasts.providerCreated'))
      dismissDialogAfterSave()
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddPreset = async (values: SaveProviderInput): Promise<void> => {
    if (!selectedPreset) return
    setIsSubmitting(true)
    try {
      replaceProvider(await updateProvider(selectedPreset.id, { ...values, isAdded: true }))
      toast.success(t('settings.providers.toasts.providerCreated'))
      dismissDialogAfterSave()
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTestConnection = async (values: SaveProviderInput): Promise<void> => {
    setIsTestingConnection(true)
    try {
      await testProviderConnection(
        {
          ...values,
          apiKey: values.apiKey === SAVED_API_KEY_MASK ? '' : values.apiKey
        },
        dialogMode === 'edit' ? activeProvider?.id : undefined
      )
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

  const handleDeleteProvider = async (provider: ProviderRecord): Promise<void> => {
    setIsDeletingProviderId(provider.id)
    try {
      await deleteProvider(provider.id)
      const next = provider.isBuiltIn
        ? providers.map((item) =>
            item.id === provider.id
              ? { ...item, enabled: false, isAdded: false, isDefault: false }
              : item
          )
        : providers.filter((item) => item.id !== provider.id)
      syncProviders(next)
      toast.success(
        provider.isBuiltIn
          ? 'Provider removed from saved providers.'
          : t('settings.providers.toasts.providerDeleted')
      )
    } catch (error) {
      toast.error(toErrorMessage(error, t))
    } finally {
      setIsDeletingProviderId(null)
    }
  }

  const createSelection = selectedPreset?.name ?? 'Custom provider'
  const dialogProvider = dialogMode === 'edit' ? activeProvider : selectedPreset

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-8 pb-12">
        <header className="flex items-end justify-between gap-6 border-b border-[color:var(--surface-border)] pb-5">
          <div className="space-y-2">
            <h1 className="font-editorial text-[2rem] leading-none tracking-[-0.035em]">Models</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Connect model providers and choose the model each one uses.
            </p>
          </div>
          <Button type="button" onClick={openCreateDialog} className="shrink-0">
            <Plus className="size-4" />
            Add model
          </Button>
        </header>

        <section aria-labelledby="saved-models-title" className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 id="saved-models-title" className="text-sm font-semibold">
              Saved models
            </h2>
            {!isLoading ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {savedProviders.length} {savedProviders.length === 1 ? 'model' : 'models'}
              </span>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)]">
            {isLoading ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                {t('settings.providers.loading')}
              </div>
            ) : null}

            {!isLoading && savedProviders.length === 0 ? (
              <div className="flex items-center justify-between gap-6 px-5 py-6">
                <div className="space-y-1">
                  <p className="font-medium">No models configured</p>
                  <p className="text-sm text-muted-foreground">
                    Add a provider to start a chat with your preferred model.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={openCreateDialog}>
                  <Plus className="size-4" />
                  Add model
                </Button>
              </div>
            ) : null}

            {savedProviders.map((provider, index) => (
              <article
                key={provider.id}
                data-provider-row={provider.id}
                className={cn(
                  'group flex min-h-20 items-center gap-4 px-5 py-4 transition-colors hover:bg-[color:var(--surface-muted)]',
                  index > 0 && 'border-t border-[color:var(--surface-border)]'
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => openEditDialog(provider.id)}
                >
                  <ProviderAvatar provider={provider} />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{provider.name}</span>
                      {provider.isDefault ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="size-3 fill-current" /> Default
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {provider.selectedModel} · {toProviderTypeLabel(provider.type, t)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'mr-2 inline-flex items-center gap-1.5 text-xs',
                      provider.enabled ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        provider.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                      )}
                    />
                    {provider.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${provider.name}`}
                    onClick={() => openEditDialog(provider.id)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t('settings.providers.deleteAriaLabel', { name: provider.name })}
                    disabled={isDeletingProviderId === provider.id}
                    onClick={() => void handleDeleteProvider(provider)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[color:var(--surface-border)] px-6 py-5 pr-14">
            <DialogTitle>{dialogMode === 'edit' ? 'Edit model' : 'Add model'}</DialogTitle>
            <DialogDescription>
              Configure an OpenAI-compatible endpoint and model. Credentials stay on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-12 w-full items-center gap-3 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 text-left outline-none transition-colors hover:bg-[color:var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {dialogProvider ? (
                      <ProviderAvatar provider={dialogProvider} className="size-7" />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-md border border-[color:var(--surface-border)]">
                        <Plus className="size-4" />
                      </span>
                    )}
                    <span className="flex-1 font-medium">
                      {dialogMode === 'edit' ? activeProvider?.name : createSelection}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[var(--radix-dropdown-menu-trigger-width)]"
                >
                  {dialogMode === 'edit' ? (
                    <>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Saved providers
                      </DropdownMenuLabel>
                      {savedProviders.map((provider) => (
                        <DropdownMenuItem
                          key={provider.id}
                          className="gap-3"
                          onSelect={() => setActiveProviderId(provider.id)}
                        >
                          <ProviderAvatar provider={provider} className="size-7" />
                          <span className="flex-1">{provider.name}</span>
                          {provider.id === activeProviderId ? <Check className="size-4" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : (
                    <>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Provider presets
                      </DropdownMenuLabel>
                      {availablePresets.map((provider) => (
                        <DropdownMenuItem
                          key={provider.id}
                          className="gap-3"
                          onSelect={() => setSelectedPresetId(provider.id)}
                        >
                          <ProviderAvatar provider={provider} className="size-7" />
                          <span className="flex-1">{provider.name}</span>
                          {provider.id === selectedPresetId ? <Check className="size-4" /> : null}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-3"
                        onSelect={() => setSelectedPresetId(null)}
                      >
                        <span className="grid size-7 place-items-center rounded-md border border-[color:var(--surface-border)]">
                          <Plus className="size-4" />
                        </span>
                        <span className="flex-1">Custom provider</span>
                        {!selectedPresetId ? <Check className="size-4" /> : null}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {dialogProvider?.isBuiltIn && dialogProvider.officialSite ? (
                <a
                  href={dialogProvider.officialSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Provider website <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>

            <div className="mt-5 border-t border-[color:var(--surface-border)]">
              {dialogMode === 'edit' && activeProvider ? (
                <ProvidersForm
                  key={activeProvider.id}
                  initialValue={toInitialFormValue(activeProvider)}
                  isPrebuilt={Boolean(activeProvider.providerModels?.length)}
                  isBuiltIn={activeProvider.isBuiltIn}
                  isSubmitting={isSubmitting}
                  isTestingConnection={isTestingConnection}
                  onCancel={closeDialog}
                  onSubmit={handleSaveEditedProvider}
                  onTestConnection={handleTestConnection}
                />
              ) : dialogMode === 'create' && selectedPreset ? (
                <ProvidersForm
                  key={selectedPreset.id}
                  initialValue={toPresetFormValue(selectedPreset)}
                  isPrebuilt={Boolean(selectedPreset.providerModels?.length)}
                  isBuiltIn
                  isSubmitting={isSubmitting}
                  isTestingConnection={isTestingConnection}
                  onCancel={closeDialog}
                  onSubmit={handleAddPreset}
                  onTestConnection={handleTestConnection}
                />
              ) : dialogMode === 'create' ? (
                <ProvidersForm
                  key="custom-provider"
                  isSubmitting={isSubmitting}
                  isTestingConnection={isTestingConnection}
                  onCancel={closeDialog}
                  onSubmit={handleCreateProvider}
                  onTestConnection={handleTestConnection}
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

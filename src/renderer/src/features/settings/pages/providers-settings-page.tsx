import { Check, Search, Trash2, X } from 'lucide-react'
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
import { isModelProviderType } from '../providers/provider-type-options'

type ProviderSettingsPageMode = 'models' | 'acp'

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
    case 'acp':
      return t('settings.providers.typeLabels.acp')
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

function isVisibleProviderForMode(
  provider: ProviderRecord,
  mode: ProviderSettingsPageMode
): boolean {
  if (mode === 'acp') {
    return provider.type === 'codex-acp' || provider.type === 'claude-agent-acp'
  }

  return isModelProviderType(provider.type)
}

function getPageCopy(
  mode: ProviderSettingsPageMode,
  t: (key: string, options?: Record<string, unknown>) => string
): {
  sidebarTitle: string
  newButton: string
  searchPlaceholder: string
  loading: string
  empty: string
  emptySearch: string
  selectPrompt: string
  createDialogTitle: string
  createDialogDescription: string
  closeCreateAriaLabel: string
  closeCreateButtonAriaLabel: string
} {
  if (mode === 'acp') {
    return {
      sidebarTitle: 'ACP',
      newButton: '+ New',
      searchPlaceholder: 'Search ACP...',
      loading: 'Loading ACP harnesses...',
      empty: 'No ACP harnesses yet. Add Codex ACP or Claude Agent ACP to get started.',
      emptySearch: 'No ACP harnesses match your search.',
      selectPrompt: 'Select an ACP harness to edit.',
      createDialogTitle: 'New ACP Harness',
      createDialogDescription: 'Configure Codex ACP or Claude Agent ACP outside the model provider list.',
      closeCreateAriaLabel: 'Close create ACP dialog',
      closeCreateButtonAriaLabel: 'Close create ACP dialog'
    }
  }

  return {
    sidebarTitle: t('settings.providers.sidebarTitle'),
    newButton: t('settings.providers.newButton'),
    searchPlaceholder: t('settings.providers.searchPlaceholder'),
    loading: t('settings.providers.loading'),
    empty: t('settings.providers.empty'),
    emptySearch: t('settings.providers.emptySearch'),
    selectPrompt: t('settings.providers.selectPrompt'),
    createDialogTitle: t('settings.providers.createDialog.title'),
    createDialogDescription: t('settings.providers.createDialog.description'),
    closeCreateAriaLabel: t('settings.providers.createDialog.closeAriaLabel'),
    closeCreateButtonAriaLabel: t('settings.providers.createDialog.closeButtonAriaLabel')
  }
}

function ProvidersSettingsWorkspace({
  mode
}: {
  mode: ProviderSettingsPageMode
}): React.JSX.Element {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [providerSearchQuery, setProviderSearchQuery] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [isDeletingProviderId, setIsDeletingProviderId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const pageCopy = useMemo(() => getPageCopy(mode, t), [mode, t])
  const visibleProviders = useMemo(
    () => providers.filter((provider) => isVisibleProviderForMode(provider, mode)),
    [mode, providers]
  )

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) {
      return null
    }

    return visibleProviders.find((provider) => provider.id === selectedProviderId) ?? null
  }, [selectedProviderId, visibleProviders])

  const filteredProviders = useMemo(() => {
    const query = providerSearchQuery.trim().toLowerCase()
    let filtered = visibleProviders

    if (query.length > 0) {
      filtered = visibleProviders.filter((provider) => {
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
  }, [providerSearchQuery, t, visibleProviders])

  const refreshProviders = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextProviders = await listProviders()
      queryClient.setQueryData(providerKeys.lists(), nextProviders)
      setProviders(nextProviders)
      setSelectedProviderId((currentProviderId) => {
        const nextVisibleProviders = nextProviders.filter((provider) =>
          isVisibleProviderForMode(provider, mode)
        )
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
  }, [mode])

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
      <div className="flex h-full min-h-0 flex-col" style={{ marginLeft: -32, marginRight: -32 }}>
        <div className="min-h-0 flex flex-1">
          <aside className="flex h-full min-h-0 w-[360px] flex-col overflow-hidden border-r border-r-border/70 bg-card shadow-xs">
            <div className="border-r-border/70 flex items-center justify-between px-4 py-3">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                {pageCopy.sidebarTitle}
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
                {pageCopy.newButton}
              </Button>
            </div>

            <div className="border-border/70 border-b px-3 py-3">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  data-provider-search-input
                  placeholder={pageCopy.searchPlaceholder}
                  className="h-9 pl-9"
                  value={providerSearchQuery}
                  onChange={(event) => setProviderSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">{pageCopy.loading}</p>
              ) : null}
              {!isLoading && visibleProviders.length === 0 ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">{pageCopy.empty}</p>
              ) : null}
              {!isLoading && visibleProviders.length > 0 && filteredProviders.length === 0 ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">{pageCopy.emptySearch}</p>
              ) : null}

              {filteredProviders.map((provider, index) => {
                const isActive = provider.id === selectedProviderId
                const avatarPath = getProviderAvatarPath(provider.icon)
                const initials = getProviderInitials(provider.name)

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
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        {avatarPath ? <AvatarImage src={avatarPath} alt={provider.name} /> : null}
                        <AvatarFallback className="text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
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
          </aside>

          <Card className="rounded-none border-none flex h-full min-h-0 flex-1 flex-col bg-card/85 shadow-xs">
            <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-4 pt-1">
              {selectedProvider ? (
                <div className="space-y-4">
                  {selectedProvider.isBuiltIn && selectedProvider.officialSite ? (
                    <div className="border-border/70 rounded-md border bg-muted/30 p-3">
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
                  <ProvidersForm
                    key={selectedProvider.id}
                    initialValue={toInitialFormValue(selectedProvider)}
                    typeScope={mode}
                    isPrebuilt={Boolean(selectedProvider.providerModels?.length)}
                    isBuiltIn={selectedProvider.isBuiltIn}
                    isSubmitting={isSubmitting}
                    isTestingConnection={isTestingConnection}
                    onSubmit={handleSaveEditedProvider}
                    onTestConnection={handleTestConnection}
                  />
                  {!selectedProvider.isBuiltIn ? (
                    <div className="border-border/70 flex justify-end border-t pt-4">
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
                  {pageCopy.selectPrompt}
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
            aria-label={pageCopy.closeCreateAriaLabel}
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
                  <CardTitle id="create-provider-title">{pageCopy.createDialogTitle}</CardTitle>
                  <p className="text-muted-foreground text-sm">{pageCopy.createDialogDescription}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeCreateDialog}
                  disabled={isSubmitting || isTestingConnection}
                  aria-label={pageCopy.closeCreateButtonAriaLabel}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ProvidersForm
                key="new-provider"
                typeScope={mode}
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

export function ProvidersSettingsPage(): React.JSX.Element {
  return <ProvidersSettingsWorkspace mode="models" />
}

export function AcpSettingsPage(): React.JSX.Element {
  return <ProvidersSettingsWorkspace mode="acp" />
}

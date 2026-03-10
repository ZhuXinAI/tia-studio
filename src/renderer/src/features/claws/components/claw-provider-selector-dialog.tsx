import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Pencil } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Switch } from '../../../components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import { providerTypeLabel } from '../claw-labels'
import type {
  ProviderRecord,
  ProviderType,
  SaveProviderInput
} from '../../settings/providers/providers-query'
import minimaxLogo from '../../../assets/providers/minimax.png'
import glmLogo from '../../../assets/providers/glm.png'
import ollamaLogo from '../../../assets/providers/ollama.png'
import openaiLogo from '../../../assets/providers/openai.png'
import anthropicLogo from '../../../assets/providers/anthropic.png'
import geminiLogo from '../../../assets/providers/gemini.png'
import kimiLogo from '../../../assets/providers/kimi.png'

type ClawProviderSelectorDialogProps = {
  isOpen: boolean
  selectedProviderId: string
  providers: ProviderRecord[]
  isMutating: boolean
  errorMessage: string | null
  onClose: () => void
  onApply: (providerId: string) => void
  onCreateProvider: (input: SaveProviderInput) => Promise<ProviderRecord> | ProviderRecord
  onUpdateProvider: (
    providerId: string,
    input: Partial<SaveProviderInput>
  ) => Promise<ProviderRecord> | ProviderRecord
}

type ProviderFormMode = 'create' | 'edit' | 'template'

type ProviderFormState = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string
  selectedModel: string
  providerModelsText: string
  supportsVision: boolean
  enabled: boolean
  icon: string | null
  officialSite: string | null
}

const providerTypes: ProviderType[] = ['openai', 'openai-response', 'gemini', 'anthropic', 'ollama']

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
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function getProviderTypeDescription(type: ProviderType, translate: Translate): string {
  return translate(`settings.providers.typeDescriptions.${type}`)
}

function emptyFormState(): ProviderFormState {
  return {
    name: '',
    type: 'openai',
    apiKey: '',
    apiHost: '',
    selectedModel: '',
    providerModelsText: '',
    supportsVision: false,
    enabled: true,
    icon: null,
    officialSite: null
  }
}

function fromBuiltInProvider(provider: ProviderRecord): ProviderFormState {
  return {
    name: provider.name,
    type: provider.type,
    apiKey: '',
    apiHost: provider.apiHost ?? '',
    selectedModel: provider.selectedModel,
    providerModelsText: provider.providerModels?.join('\n') ?? '',
    supportsVision: provider.supportsVision,
    enabled: true,
    icon: provider.icon,
    officialSite: provider.officialSite
  }
}

function toEditFormState(provider: ProviderRecord): ProviderFormState {
  return {
    name: provider.name,
    type: provider.type,
    apiKey: '',
    apiHost: provider.apiHost ?? '',
    selectedModel: provider.selectedModel,
    providerModelsText: provider.providerModels?.join('\n') ?? '',
    supportsVision: provider.supportsVision,
    enabled: provider.enabled,
    icon: provider.icon,
    officialSite: provider.officialSite
  }
}

function parseProviderModels(text: string): string[] | undefined {
  const models = text
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return models.length > 0 ? models : undefined
}

function buildCreateInput(formState: ProviderFormState): SaveProviderInput {
  return {
    name: formState.name.trim(),
    type: formState.type,
    apiKey: formState.apiKey.trim(),
    apiHost: formState.apiHost.trim() || undefined,
    selectedModel: formState.selectedModel.trim(),
    providerModels: parseProviderModels(formState.providerModelsText),
    supportsVision: formState.supportsVision,
    enabled: formState.enabled
  }
}

function buildUpdateInput(formState: ProviderFormState): Partial<SaveProviderInput> {
  return {
    name: formState.name.trim(),
    ...(formState.apiKey.trim().length > 0 ? { apiKey: formState.apiKey.trim() } : {}),
    apiHost: formState.apiHost.trim() || undefined,
    selectedModel: formState.selectedModel.trim(),
    providerModels: parseProviderModels(formState.providerModelsText),
    supportsVision: formState.supportsVision,
    enabled: formState.enabled
  }
}

export function ClawProviderSelectorDialog({
  isOpen,
  selectedProviderId,
  providers,
  isMutating,
  errorMessage,
  onClose,
  onApply,
  onCreateProvider,
  onUpdateProvider
}: ClawProviderSelectorDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [localProviders, setLocalProviders] = useState(providers)
  const [localSelectedProviderId, setLocalSelectedProviderId] = useState(selectedProviderId)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<ProviderFormMode>('create')
  const [formState, setFormState] = useState<ProviderFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isFormSubmitting, setIsFormSubmitting] = useState(false)

  const builtInProviders = useMemo(
    () => localProviders.filter((p) => p.isBuiltIn && !p.apiKey),
    [localProviders]
  )
  const configuredProviders = useMemo(
    () => localProviders.filter((p) => !p.isBuiltIn || p.apiKey),
    [localProviders]
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalProviders(providers)
    setFormError(null)
    setIsFormDialogOpen(false)
    setIsTemplateDialogOpen(false)
    setFormState(emptyFormState())
    setFormMode('create')
  }, [providers, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalSelectedProviderId(selectedProviderId)
  }, [isOpen, selectedProviderId])

  const selectedProvider = useMemo(
    () => localProviders.find((provider) => provider.id === localSelectedProviderId) ?? null,
    [localProviders, localSelectedProviderId]
  )

  function resetForm(): void {
    setFormMode('create')
    setFormState(emptyFormState())
    setFormError(null)
  }

  function openTemplateDialog(): void {
    setIsTemplateDialogOpen(true)
  }

  function selectTemplate(provider: ProviderRecord): void {
    setFormMode('template')
    setFormState(fromBuiltInProvider(provider))
    setFormError(null)
    setIsTemplateDialogOpen(false)
    setIsFormDialogOpen(true)
  }

  function openCreateDialog(): void {
    setFormMode('create')
    setFormState(emptyFormState())
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  function openEditDialog(): void {
    if (!selectedProvider) {
      return
    }

    setFormMode('edit')
    setFormState(toEditFormState(selectedProvider))
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  function replaceLocalProvider(updatedProvider: ProviderRecord): void {
    setLocalProviders((currentProviders) =>
      currentProviders.map((provider) =>
        provider.id === updatedProvider.id ? updatedProvider : provider
      )
    )
  }

  async function handleSubmitForm(): Promise<void> {
    if (formState.name.trim().length === 0) {
      setFormError(t('settings.providers.form.errors.nameRequired'))
      return
    }

    if (formState.selectedModel.trim().length === 0) {
      setFormError(t('settings.providers.form.errors.selectedModelRequired'))
      return
    }

    if (formMode === 'create' && formState.apiKey.trim().length === 0) {
      setFormError(t('settings.providers.form.errors.apiKeyRequired'))
      return
    }

    if (formMode === 'template' && formState.apiKey.trim().length === 0) {
      setFormError(t('settings.providers.form.errors.apiKeyRequired'))
      return
    }

    setIsFormSubmitting(true)
    setFormError(null)

    try {
      if (formMode === 'create' || formMode === 'template') {
        const createdProvider = await onCreateProvider(buildCreateInput(formState))
        setLocalProviders((currentProviders) => [...currentProviders, createdProvider])
        setLocalSelectedProviderId(createdProvider.id)
      } else if (selectedProvider) {
        const updatedProvider = await onUpdateProvider(
          selectedProvider.id,
          buildUpdateInput(formState)
        )
        replaceLocalProvider(updatedProvider)
        setLocalSelectedProviderId(updatedProvider.id)
      }

      setIsFormDialogOpen(false)
      resetForm()
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : t(
              formMode === 'edit'
                ? 'settings.providers.form.errors.updateFailed'
                : 'settings.providers.form.errors.createFailed'
            )
      )
    } finally {
      setIsFormSubmitting(false)
    }
  }

  const isBusy = isMutating || isFormSubmitting
  const providerNameInputId =
    formMode === 'create' ? 'claw-provider-create-name' : 'claw-provider-form-name'
  const providerTypeInputId =
    formMode === 'create' ? 'claw-provider-create-type' : 'claw-provider-form-type'
  const apiKeyInputId =
    formMode === 'create' ? 'claw-provider-create-api-key' : 'claw-provider-form-api-key'
  const apiHostInputId =
    formMode === 'create' ? 'claw-provider-create-api-host' : 'claw-provider-form-api-host'
  const selectedModelInputId =
    formMode === 'create'
      ? 'claw-provider-create-selected-model'
      : 'claw-provider-form-selected-model'
  const providerModelsInputId =
    formMode === 'create'
      ? 'claw-provider-create-provider-models'
      : 'claw-provider-form-provider-models'
  const saveButtonId =
    formMode === 'create' ? 'claw-provider-create-save' : 'claw-provider-form-save'

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('claws.providerSelector.title')}</DialogTitle>
            <DialogDescription>{t('claws.providerSelector.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            {configuredProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('claws.providerSelector.empty')}</p>
            ) : (
              <div className="space-y-2">
                {configuredProviders.map((provider) => {
                  const selected = provider.id === localSelectedProviderId
                  const avatarPath = getProviderAvatarPath(provider.icon)
                  const initials = getProviderInitials(provider.name)

                  return (
                    <button
                      key={provider.id}
                      type="button"
                      data-provider-id={provider.id}
                      data-selected={selected ? 'true' : 'false'}
                      disabled={isBusy}
                      className={cn(
                        'w-full rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:border-primary/40 hover:bg-muted/50'
                      )}
                      onClick={() => setLocalSelectedProviderId(provider.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Avatar className="size-10">
                            {avatarPath ? <AvatarImage src={avatarPath} alt={provider.name} /> : null}
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{provider.name}</p>
                              {selected ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  <CheckCircle2 className="size-3" />
                                  {t('claws.providerSelector.selectedBadge')}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {providerTypeLabel(provider.type, t)} · {provider.selectedModel}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            'text-xs',
                            provider.enabled ? 'text-green-600' : 'text-muted-foreground'
                          )}
                        >
                          {provider.enabled
                            ? t('claws.providerSelector.enabled')
                            : t('claws.providerSelector.disabled')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                id="claw-provider-selector-add-template"
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={openTemplateDialog}
              >
                {t('claws.providerSelector.actions.addFromTemplate')}
              </Button>
              <Button
                id="claw-provider-selector-add-custom"
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={openCreateDialog}
              >
                {t('claws.providerSelector.actions.addCustom')}
              </Button>
              <Button
                id="claw-provider-selector-edit"
                type="button"
                variant="outline"
                disabled={selectedProvider === null || isBusy}
                onClick={openEditDialog}
              >
                <Pencil className="size-4" />
                {t('claws.providerSelector.actions.edit')}
              </Button>
              <Button
                id="claw-provider-selector-clear"
                type="button"
                variant="outline"
                disabled={localSelectedProviderId.length === 0 || isBusy}
                onClick={() => setLocalSelectedProviderId('')}
              >
                {t('claws.providerSelector.actions.clear')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('claws.providerSelector.actions.cancel')}
            </Button>
            <Button
              id="claw-provider-selector-apply"
              type="button"
              disabled={isBusy}
              onClick={() => {
                onApply(localSelectedProviderId)
                onClose()
              }}
            >
              {t('claws.providerSelector.actions.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isFormDialogOpen}
        onOpenChange={(open) => {
          setIsFormDialogOpen(open)
          if (!open) {
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {formMode === 'template'
                ? t('claws.providerSelector.template.title')
                : formMode === 'create'
                  ? t('claws.providerSelector.create.title')
                  : t('claws.providerSelector.edit.title')}
            </DialogTitle>
            <DialogDescription>
              {formMode === 'template'
                ? t('claws.providerSelector.template.description')
                : formMode === 'create'
                  ? t('claws.providerSelector.create.description')
                  : t('claws.providerSelector.edit.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {formError ? (
              <p
                id={
                  formMode === 'create' ? 'claw-provider-create-error' : 'claw-provider-form-error'
                }
                className="text-sm text-destructive"
              >
                {formError}
              </p>
            ) : null}

            {formMode === 'template' && formState.officialSite ? (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm">
                  {t('claws.providerSelector.template.getApiKeyPrompt')}{' '}
                  <a
                    href={formState.officialSite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    {formState.officialSite}
                  </a>
                </p>
              </div>
            ) : null}

            <div className="grid gap-2">
              <label htmlFor={providerNameInputId} className="text-sm font-medium">
                {t('settings.providers.form.providerName')}
              </label>
              <Input
                id={providerNameInputId}
                value={formState.name}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    name: event.target.value
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor={providerTypeInputId} className="text-sm font-medium">
                {t('settings.providers.form.type')}
              </label>
              <select
                id={providerTypeInputId}
                className="border-input bg-background rounded-md border px-3 py-2 text-sm disabled:opacity-100"
                value={formState.type}
                disabled={formMode === 'edit' || formMode === 'template'}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    type: event.target.value as ProviderType
                  }))
                }
              >
                {providerTypes.map((providerType) => (
                  <option key={providerType} value={providerType}>
                    {providerTypeLabel(providerType, t)}
                  </option>
                ))}
              </select>
              {formMode === 'create' ? (
                <p className="text-xs text-muted-foreground">
                  {getProviderTypeDescription(formState.type, t)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor={apiKeyInputId} className="text-sm font-medium">
                {t('settings.providers.form.apiKey')}
              </label>
              <Input
                id={apiKeyInputId}
                type="password"
                placeholder={
                  formMode === 'edit'
                    ? t('claws.providerSelector.edit.apiKeyPlaceholder')
                    : 'sk-...'
                }
                value={formState.apiKey}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    apiKey: event.target.value
                  }))
                }
              />
              {formMode === 'template' ? (
                <p className="text-xs text-muted-foreground">
                  {t('claws.providerSelector.template.apiKeyHint')}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor={apiHostInputId} className="text-sm font-medium">
                {t('settings.providers.form.apiHost')}
              </label>
              <Input
                id={apiHostInputId}
                placeholder="https://api.openai.com/v1"
                value={formState.apiHost}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    apiHost: event.target.value
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor={selectedModelInputId} className="text-sm font-medium">
                {t('settings.providers.form.selectedModel')}
              </label>
              <Input
                id={selectedModelInputId}
                placeholder="gpt-4o"
                value={formState.selectedModel}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    selectedModel: event.target.value
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor={providerModelsInputId} className="text-sm font-medium">
                {t('settings.providers.form.providerModels')}
              </label>
              <Textarea
                id={providerModelsInputId}
                placeholder={t('settings.providers.form.providerModelsDescription')}
                value={formState.providerModelsText}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    providerModelsText: event.target.value
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="claw-provider-supports-vision" className="text-sm font-medium">
                {t('settings.providers.form.supportsVision')}
              </label>
              <Switch
                id="claw-provider-supports-vision"
                checked={formState.supportsVision}
                onCheckedChange={(checked) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    supportsVision: checked
                  }))
                }
              />
            </div>

            {formMode === 'edit' ? (
              <p className="text-xs text-muted-foreground">
                {t('claws.providerSelector.edit.apiKeyOptional')}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsFormDialogOpen(false)
                resetForm()
              }}
            >
              {t('claws.providerSelector.actions.cancel')}
            </Button>
            <Button
              id={saveButtonId}
              type="button"
              disabled={isBusy}
              onClick={() => void handleSubmitForm()}
            >
              {formMode === 'template'
                ? t('claws.providerSelector.template.save')
                : formMode === 'create'
                  ? t('claws.providerSelector.create.save')
                  : t('claws.providerSelector.edit.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isTemplateDialogOpen}
        onOpenChange={(open) => {
          setIsTemplateDialogOpen(open)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('claws.providerSelector.templates.title')}</DialogTitle>
            <DialogDescription>
              {t('claws.providerSelector.templates.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {builtInProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('claws.providerSelector.templates.empty')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {builtInProviders.map((provider) => {
                  const avatarPath = getProviderAvatarPath(provider.icon)
                  const initials = getProviderInitials(provider.name)

                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                      onClick={() => selectTemplate(provider)}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10">
                            {avatarPath ? <AvatarImage src={avatarPath} alt={provider.name} /> : null}
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <p className="font-medium">{provider.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {providerTypeLabel(provider.type, t)} · {provider.selectedModel}
                        </p>
                        {provider.officialSite ? (
                          <a
                            href={provider.officialSite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {provider.officialSite}
                          </a>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsTemplateDialogOpen(false)}
            >
              {t('claws.providerSelector.actions.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

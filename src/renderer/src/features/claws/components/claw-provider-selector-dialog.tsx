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
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import type {
  ProviderRecord,
  ProviderType,
  SaveProviderInput
} from '../../settings/providers/providers-query'

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

type ProviderFormMode = 'create' | 'edit'

type ProviderFormState = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string
  selectedModel: string
  providerModelsText: string
  supportsVision: boolean
  enabled: boolean
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
    enabled: true
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
    enabled: provider.enabled
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
  const [formMode, setFormMode] = useState<ProviderFormMode>('create')
  const [formState, setFormState] = useState<ProviderFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isFormSubmitting, setIsFormSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalProviders(providers)
    setFormError(null)
    setIsFormDialogOpen(false)
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

    setIsFormSubmitting(true)
    setFormError(null)

    try {
      if (formMode === 'create') {
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
              formMode === 'create'
                ? 'settings.providers.form.errors.createFailed'
                : 'settings.providers.form.errors.updateFailed'
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

            {localProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('claws.providerSelector.empty')}</p>
            ) : (
              <div className="space-y-2">
                {localProviders.map((provider) => {
                  const selected = provider.id === localSelectedProviderId

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
                            {provider.type} · {provider.selectedModel}
                          </p>
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
                id="claw-provider-selector-add"
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={openCreateDialog}
              >
                {t('claws.providerSelector.actions.add')}
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
              {formMode === 'create'
                ? t('claws.providerSelector.create.title')
                : t('claws.providerSelector.edit.title')}
            </DialogTitle>
            <DialogDescription>
              {formMode === 'create'
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
                disabled={formMode === 'edit'}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    type: event.target.value as ProviderType
                  }))
                }
              >
                <option value="openai">OpenAI</option>
                <option value="openai-response">OpenAI-Response</option>
                <option value="gemini">Gemini</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
              </select>
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
              {formMode === 'create'
                ? t('claws.providerSelector.create.save')
                : t('claws.providerSelector.edit.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

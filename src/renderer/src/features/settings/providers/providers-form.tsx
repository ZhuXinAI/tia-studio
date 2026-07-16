import { useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Field, FieldLabel, FieldDescription, FieldError } from '../../../components/ui/field'
import { Switch } from '../../../components/ui/switch'
import { getVisibleProviderTypeOptions } from './provider-type-options'
import type { ProviderType, SaveProviderInput } from './providers-query'

const providerSelectClassName =
  'h-11 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-2 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]'

const defaultModelByProviderType: Record<ProviderType, string> = {
  openai: 'gpt-4o',
  'openai-response': 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  gemini: 'gemini-2.0-flash-exp',
  anthropic: 'claude-3-5-sonnet-20241022',
  ollama: 'llama3.2'
}

export type ProviderFormValues = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string
  selectedModel: string
  selectedModelContextWindowTokensText: string
  providerModelsText: string
  supportsVision: boolean
  enabled: boolean
  isDefault?: boolean
}

export type ProviderFormErrors = {
  selectedModel?: string
}

function getDefaultModelForProviderType(type: ProviderType): string {
  return defaultModelByProviderType[type]
}

export function validateProviderForm(
  values: ProviderFormValues,
  selectedModelRequiredMessage: string
): ProviderFormErrors {
  const errors: ProviderFormErrors = {}

  if (values.selectedModel.trim().length === 0) {
    errors.selectedModel = selectedModelRequiredMessage
  }

  return errors
}

export function parseProviderModelsInput(input: string): string[] {
  return input
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseContextWindowTokensInput(input: string): number | undefined {
  const normalizedInput = input.trim()
  if (normalizedInput.length === 0) {
    return undefined
  }

  const parsed = Number(normalizedInput)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return Math.round(parsed)
}

export function shouldShowProviderModelsField(isPrebuilt: boolean): boolean {
  return isPrebuilt
}

type ProvidersFormProps = {
  initialValue?: Partial<ProviderFormValues>
  isSubmitting?: boolean
  isTestingConnection?: boolean
  isPrebuilt?: boolean
  isBuiltIn?: boolean
  stickyActions?: boolean
  onSubmit: (values: SaveProviderInput, onSuccess?: () => void) => Promise<void> | void
  onTestConnection?: (values: SaveProviderInput) => Promise<void> | void
}

function toProviderPayload(
  values: ProviderFormValues,
  showProviderModels: boolean
): SaveProviderInput {
  return {
    name: values.name.trim(),
    type: values.type,
    apiKey: values.apiKey.trim(),
    apiHost: values.apiHost.trim() || undefined,
    selectedModel: values.selectedModel.trim(),
    selectedModelContextWindowTokens: parseContextWindowTokensInput(
      values.selectedModelContextWindowTokensText
    ),
    providerModels: showProviderModels
      ? parseProviderModelsInput(values.providerModelsText)
      : undefined,
    supportsVision: values.supportsVision,
    enabled: values.enabled,
    isDefault: values.isDefault ?? false
  }
}

export function ProvidersForm({
  initialValue,
  isSubmitting,
  isTestingConnection,
  isPrebuilt = false,
  isBuiltIn = false,
  stickyActions = false,
  onSubmit,
  onTestConnection
}: ProvidersFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const [values, setValues] = useState<ProviderFormValues>({
    name: initialValue?.name ?? '',
    type: initialValue?.type ?? 'openai',
    apiKey: initialValue?.apiKey ?? '',
    apiHost: initialValue?.apiHost ?? '',
    selectedModel:
      initialValue?.selectedModel ??
      (initialValue?.type ? getDefaultModelForProviderType(initialValue.type) : 'gpt-4o'),
    selectedModelContextWindowTokensText: initialValue?.selectedModelContextWindowTokensText ?? '',
    providerModelsText: initialValue?.providerModelsText ?? '',
    supportsVision: initialValue?.supportsVision ?? false,
    enabled: initialValue?.enabled ?? true,
    isDefault: initialValue?.isDefault ?? false
  })
  const [errors, setErrors] = useState<ProviderFormErrors>({})
  const [hasProviderModels, setHasProviderModels] = useState<boolean>(() => {
    return Boolean(initialValue?.providerModelsText?.trim().length) || isPrebuilt
  })

  const showProviderModels = useMemo(() => {
    return shouldShowProviderModelsField(hasProviderModels)
  }, [hasProviderModels])
  const providerTypeOptions = useMemo(
    () => getVisibleProviderTypeOptions(values.type),
    [values.type]
  )
  const updateValue = (key: keyof ProviderFormValues, value: string) => {
    setValues((prev) => {
      if (key === 'type') {
        const nextType = value as ProviderType
        return {
          ...prev,
          type: nextType,
          selectedModel: getDefaultModelForProviderType(nextType)
        }
      }

      if (key === 'providerModelsText') {
        const models = parseProviderModelsInput(value)
        return {
          ...prev,
          providerModelsText: value,
          selectedModel:
            prev.selectedModel.trim().length === 0 && models[0] ? models[0] : prev.selectedModel
        }
      }

      return {
        ...prev,
        [key]: value
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formErrors = validateProviderForm(
      values,
      t('settings.providers.form.errors.selectedModelRequired')
    )
    setErrors(formErrors)

    if (Object.keys(formErrors).length > 0) {
      return
    }

    await onSubmit(toProviderPayload(values, showProviderModels), () => {
      setValues({
        ...values,
        enabled: true
      })
    })
  }

  const handleTestConnection = async () => {
    if (!onTestConnection) {
      return
    }

    const formErrors = validateProviderForm(
      values,
      t('settings.providers.form.errors.selectedModelRequired')
    )
    setErrors(formErrors)
    if (Object.keys(formErrors).length > 0) {
      return
    }

    await onTestConnection(toProviderPayload(values, showProviderModels))
  }

  return (
    <form className="flex min-h-0 flex-col py-4" onSubmit={handleSubmit}>
      <div className="space-y-4">
        {isBuiltIn ? (
          <Field>
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
              <div className="space-y-0.5">
                <FieldLabel htmlFor="provider-enabled">
                  {t('settings.providers.form.enableProvider')}
                </FieldLabel>
                <FieldDescription>
                  {t('settings.providers.form.enableProviderDescription')}
                </FieldDescription>
              </div>
              <Switch
                id="provider-enabled"
                checked={values.enabled}
                onCheckedChange={(checked) => setValues((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="provider-name">
            {t('settings.providers.form.providerName')}
          </FieldLabel>
          <Input
            id="provider-name"
            value={values.name}
            onChange={(event) => updateValue('name', event.target.value)}
            placeholder="OpenAI"
            disabled={isBuiltIn}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="provider-type">{t('settings.providers.form.type')}</FieldLabel>
          <select
            id="provider-type"
            className={providerSelectClassName}
            value={values.type}
            onChange={(event) => updateValue('type', event.target.value as ProviderType)}
            disabled={isBuiltIn}
          >
            {providerTypeOptions.map((providerType) => (
              <option key={providerType} value={providerType}>
                {t(`settings.providers.typeLabels.${providerType}`)}
              </option>
            ))}
          </select>
        </Field>

        <>
          <Field>
            <FieldLabel htmlFor="provider-api-key">
              {t('settings.providers.form.apiKey')}
            </FieldLabel>
            <Input
              id="provider-api-key"
              value={values.apiKey}
              onChange={(event) => updateValue('apiKey', event.target.value)}
              placeholder="sk-..."
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="provider-api-host">
              {t('settings.providers.form.apiHost')}
            </FieldLabel>
            <Input
              id="provider-api-host"
              value={values.apiHost}
              onChange={(event) => updateValue('apiHost', event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="provider-selected-model">
              {t('settings.providers.form.selectedModel')}
            </FieldLabel>
            <Input
              id="provider-selected-model"
              value={values.selectedModel}
              onChange={(event) => updateValue('selectedModel', event.target.value)}
              placeholder="gpt-5"
            />
            <FieldError>{errors.selectedModel}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="provider-context-window">
              Model context window (optional)
            </FieldLabel>
            <FieldDescription>
              Used for the thread context usage indicator when the app cannot infer an exact limit
              from provider metadata.
            </FieldDescription>
            <Input
              id="provider-context-window"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={values.selectedModelContextWindowTokensText}
              onChange={(event) =>
                updateValue('selectedModelContextWindowTokensText', event.target.value)
              }
              placeholder="200000"
            />
          </Field>
        </>

        <Field>
          <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
            <div className="space-y-0.5">
              <FieldLabel htmlFor="provider-model-presets">
                {t('settings.providers.form.includeModelPresets')}
              </FieldLabel>
              <FieldDescription>
                Save a reusable model list for faster workspace setup.
              </FieldDescription>
            </div>
            <Switch
              id="provider-model-presets"
              checked={hasProviderModels}
              onCheckedChange={setHasProviderModels}
            />
          </div>
        </Field>

        {showProviderModels ? (
          <Field>
            <FieldLabel htmlFor="provider-models-list">
              {t('settings.providers.form.providerModels')}
            </FieldLabel>
            <FieldDescription>
              {t('settings.providers.form.providerModelsDescription')}
            </FieldDescription>
            <Textarea
              id="provider-models-list"
              value={values.providerModelsText}
              onChange={(event) => updateValue('providerModelsText', event.target.value)}
              placeholder="MiniMax-M2.5, MiniMax-M2.5-lightning"
            />
          </Field>
        ) : null}

        <Field>
          <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
            <div className="space-y-0.5">
              <FieldLabel htmlFor="supports-vision">
                {t('settings.providers.form.supportsVision')}
              </FieldLabel>
              <FieldDescription>
                {t('settings.providers.form.supportsVisionDescription')}
              </FieldDescription>
            </div>
            <Switch
              id="supports-vision"
              checked={values.supportsVision}
              onCheckedChange={(checked) =>
                setValues((prev) => ({ ...prev, supportsVision: checked }))
              }
            />
          </div>
        </Field>

        <Field>
          <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
            <div className="space-y-0.5">
              <FieldLabel htmlFor="provider-is-default">Make this the default provider</FieldLabel>
              <FieldDescription>
                New chats start here unless a workspace or thread chooses a different model.
              </FieldDescription>
            </div>
            <Switch
              id="provider-is-default"
              checked={values.isDefault}
              onCheckedChange={(checked) => setValues((prev) => ({ ...prev, isDefault: checked }))}
            />
          </div>
        </Field>
      </div>

      <div
        data-provider-form-actions={stickyActions ? 'sticky' : 'default'}
        className={
          stickyActions
            ? 'sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap justify-end gap-2 border-t border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_72%,transparent),var(--surface-paper))] px-4 pt-4 pb-1 backdrop-blur-sm'
            : 'mt-4 flex flex-wrap justify-end gap-2'
        }
      >
        {onTestConnection ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTestConnection()}
            disabled={isSubmitting || isTestingConnection}
          >
            {isTestingConnection
              ? t('settings.providers.form.buttons.testing')
              : t('settings.providers.form.buttons.testConnection')}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t('settings.providers.form.buttons.saving')
            : t('settings.providers.form.buttons.saveProvider')}
        </Button>
      </div>
    </form>
  )
}

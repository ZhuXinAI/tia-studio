import { useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Field, FieldLabel, FieldDescription, FieldError } from '../../../components/ui/field'
import { Switch } from '../../../components/ui/switch'
import { getVisibleProviderTypeOptions } from './provider-type-options'
import type { ProviderType, SaveProviderInput } from './providers-query'

export type ProviderFormValues = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string
  selectedModel: string
  providerModelsText: string
  supportsVision: boolean
  enabled: boolean
}

export type ProviderFormErrors = {
  selectedModel?: string
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

export function shouldShowProviderModelsField(isPrebuilt: boolean): boolean {
  return isPrebuilt
}

type ProvidersFormProps = {
  initialValue?: Partial<ProviderFormValues>
  isSubmitting?: boolean
  isTestingConnection?: boolean
  isPrebuilt?: boolean
  isBuiltIn?: boolean
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
    providerModels: showProviderModels
      ? parseProviderModelsInput(values.providerModelsText)
      : undefined,
    supportsVision: values.supportsVision,
    enabled: values.enabled
  }
}

export function ProvidersForm({
  initialValue,
  isSubmitting,
  isTestingConnection,
  isPrebuilt = false,
  isBuiltIn = false,
  onSubmit,
  onTestConnection
}: ProvidersFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const [values, setValues] = useState<ProviderFormValues>({
    name: initialValue?.name ?? '',
    type: initialValue?.type ?? 'openai',
    apiKey: initialValue?.apiKey ?? '',
    apiHost: initialValue?.apiHost ?? '',
    selectedModel: initialValue?.selectedModel ?? '',
    providerModelsText: initialValue?.providerModelsText ?? '',
    supportsVision: initialValue?.supportsVision ?? false,
    enabled: initialValue?.enabled ?? true
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
    setValues((prev) => ({
      ...prev,
      [key]: value
    }))
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
    <form className="py-4 flex flex-col gap-4" onSubmit={handleSubmit}>
      {isBuiltIn ? (
        <Field>
          <div className="flex items-center justify-between">
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
        <FieldLabel htmlFor="provider-name">{t('settings.providers.form.providerName')}</FieldLabel>
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
          className="border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

      <Field>
        <FieldLabel htmlFor="provider-api-key">{t('settings.providers.form.apiKey')}</FieldLabel>
        <Input
          id="provider-api-key"
          value={values.apiKey}
          onChange={(event) => updateValue('apiKey', event.target.value)}
          placeholder="sk-..."
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="provider-api-host">{t('settings.providers.form.apiHost')}</FieldLabel>
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

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="border-input h-4 w-4 rounded border bg-transparent"
          checked={hasProviderModels}
          onChange={(event) => setHasProviderModels(event.target.checked)}
        />
        {t('settings.providers.form.includeModelPresets')}
      </label>

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
        <div className="flex items-center justify-between">
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

      <div className="flex flex-wrap justify-end gap-2">
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

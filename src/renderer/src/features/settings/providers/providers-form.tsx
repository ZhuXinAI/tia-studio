import { useMemo, useState } from 'react'
import type { ProviderType, SaveProviderInput } from './providers-query'

export type ProviderFormValues = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string
  selectedModel: string
  providerModelsText: string
}

export type ProviderFormErrors = {
  selectedModel?: string
}

export function validateProviderForm(values: ProviderFormValues): ProviderFormErrors {
  const errors: ProviderFormErrors = {}

  if (values.selectedModel.trim().length === 0) {
    errors.selectedModel = 'Selected model is required'
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
  isPrebuilt?: boolean
  onSubmit: (values: SaveProviderInput) => Promise<void> | void
}

export function ProvidersForm({
  initialValue,
  isSubmitting,
  isPrebuilt = false,
  onSubmit
}: ProvidersFormProps): React.JSX.Element {
  const [values, setValues] = useState<ProviderFormValues>({
    name: initialValue?.name ?? '',
    type: initialValue?.type ?? 'openai',
    apiKey: initialValue?.apiKey ?? '',
    apiHost: initialValue?.apiHost ?? '',
    selectedModel: initialValue?.selectedModel ?? '',
    providerModelsText: initialValue?.providerModelsText ?? ''
  })
  const [errors, setErrors] = useState<ProviderFormErrors>({})
  const [hasProviderModels, setHasProviderModels] = useState<boolean>(() => {
    return Boolean(initialValue?.providerModelsText?.trim().length) || isPrebuilt
  })

  const showProviderModels = useMemo(() => {
    return shouldShowProviderModelsField(hasProviderModels)
  }, [hasProviderModels])

  const updateValue = (key: keyof ProviderFormValues, value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formErrors = validateProviderForm(values)
    setErrors(formErrors)

    if (Object.keys(formErrors).length > 0) {
      return
    }

    await onSubmit({
      name: values.name,
      type: values.type,
      apiKey: values.apiKey,
      apiHost: values.apiHost || undefined,
      selectedModel: values.selectedModel,
      providerModels: showProviderModels ? parseProviderModelsInput(values.providerModelsText) : undefined
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px', maxWidth: '680px' }}>
      <label>
        Provider Name
        <input value={values.name} onChange={(event) => updateValue('name', event.target.value)} />
      </label>

      <label>
        Type
        <select
          value={values.type}
          onChange={(event) => updateValue('type', event.target.value as ProviderType)}
        >
          <option value="openai">OpenAI</option>
          <option value="openai-response">OpenAI-Response</option>
          <option value="gemini">Gemini</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
        </select>
      </label>

      <label>
        API Key
        <input value={values.apiKey} onChange={(event) => updateValue('apiKey', event.target.value)} />
      </label>

      <label>
        API Host
        <input value={values.apiHost} onChange={(event) => updateValue('apiHost', event.target.value)} />
      </label>

      <label>
        Selected Model
        <input
          value={values.selectedModel}
          onChange={(event) => updateValue('selectedModel', event.target.value)}
        />
      </label>

      {errors.selectedModel ? <p style={{ color: '#ff6b6b', margin: 0 }}>{errors.selectedModel}</p> : null}

      <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={hasProviderModels}
          onChange={(event) => setHasProviderModels(event.target.checked)}
        />
        Include optional provider model presets
      </label>

      {showProviderModels ? (
        <label>
          Provider Models (optional)
          <textarea
            value={values.providerModelsText}
            onChange={(event) => updateValue('providerModelsText', event.target.value)}
          />
        </label>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Provider'}
      </button>
    </form>
  )
}

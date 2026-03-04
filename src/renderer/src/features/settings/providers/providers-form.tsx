import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
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
  isTestingConnection?: boolean
  isPrebuilt?: boolean
  onSubmit: (values: SaveProviderInput) => Promise<void> | void
  onTestConnection?: (values: SaveProviderInput) => Promise<void> | void
}

function toProviderPayload(values: ProviderFormValues, showProviderModels: boolean): SaveProviderInput {
  return {
    name: values.name.trim(),
    type: values.type,
    apiKey: values.apiKey.trim(),
    apiHost: values.apiHost.trim() || undefined,
    selectedModel: values.selectedModel.trim(),
    providerModels: showProviderModels ? parseProviderModelsInput(values.providerModelsText) : undefined
  }
}

export function ProvidersForm({
  initialValue,
  isSubmitting,
  isTestingConnection,
  isPrebuilt = false,
  onSubmit,
  onTestConnection
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

    await onSubmit(toProviderPayload(values, showProviderModels))
  }

  const handleTestConnection = async () => {
    if (!onTestConnection) {
      return
    }

    const formErrors = validateProviderForm(values)
    setErrors(formErrors)
    if (Object.keys(formErrors).length > 0) {
      return
    }

    await onTestConnection(toProviderPayload(values, showProviderModels))
  }

  return (
    <form className="py-4" onSubmit={handleSubmit}>
      <div className="my-2">
        <Label htmlFor="provider-name">Provider Name</Label>
        <Input
          id="provider-name"
          value={values.name}
          onChange={(event) => updateValue('name', event.target.value)}
          placeholder="OpenAI"
        />
      </div>

      <div className="my-2">
        <Label htmlFor="provider-type">Type</Label>
        <select
          id="provider-type"
          className="border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={values.type}
          onChange={(event) => updateValue('type', event.target.value as ProviderType)}
        >
          <option value="openai">OpenAI</option>
          <option value="openai-response">OpenAI-Response</option>
          <option value="gemini">Gemini</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      <div className="my-2">
        <Label htmlFor="provider-api-key">API Key</Label>
        <Input
          id="provider-api-key"
          value={values.apiKey}
          onChange={(event) => updateValue('apiKey', event.target.value)}
          placeholder="sk-..."
        />
      </div>

      <div className="my-2">
        <Label htmlFor="provider-api-host">API Host</Label>
        <Input
          id="provider-api-host"
          value={values.apiHost}
          onChange={(event) => updateValue('apiHost', event.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="my-2">
        <Label htmlFor="provider-selected-model">Selected Model</Label>
        <Input
          id="provider-selected-model"
          value={values.selectedModel}
          onChange={(event) => updateValue('selectedModel', event.target.value)}
          placeholder="gpt-5"
        />
      </div>

      {errors.selectedModel ? <p className="text-destructive text-sm">{errors.selectedModel}</p> : null}

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="border-input h-4 w-4 rounded border bg-transparent"
          checked={hasProviderModels}
          onChange={(event) => setHasProviderModels(event.target.checked)}
        />
        Include optional provider model presets
      </label>

      {showProviderModels ? (
        <div className="my-2">
          <Label htmlFor="provider-models-list">Provider Models (optional)</Label>
          <Textarea
            id="provider-models-list"
            value={values.providerModelsText}
            onChange={(event) => updateValue('providerModelsText', event.target.value)}
            placeholder="MiniMax-M2.5, MiniMax-M2.5-lightning"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onTestConnection ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTestConnection()}
            disabled={isSubmitting || isTestingConnection}
          >
            {isTestingConnection ? 'Testing...' : 'Test Connection'}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Provider'}
        </Button>
      </div>
    </form>
  )
}

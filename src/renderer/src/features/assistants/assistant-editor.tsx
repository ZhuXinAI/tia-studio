import { useMemo, useState } from 'react'
import type { SaveAssistantInput, AssistantRecord } from './assistants-query'
import type { ProviderRecord } from '../settings/providers/providers-query'

type AssistantEditorValues = {
  name: string
  providerId: string
  workspacePath: string
}

type AssistantEditorProps = {
  providers: ProviderRecord[]
  initialValue?: AssistantRecord | null
  isSubmitting?: boolean
  onSubmit: (input: SaveAssistantInput) => Promise<void> | void
}

function toInitialValues(initialValue?: AssistantRecord | null): AssistantEditorValues {
  return {
    name: initialValue?.name ?? '',
    providerId: initialValue?.providerId ?? '',
    workspacePath:
      typeof initialValue?.workspaceConfig?.rootPath === 'string'
        ? (initialValue.workspaceConfig.rootPath as string)
        : ''
  }
}

function validate(values: AssistantEditorValues): string | null {
  if (values.name.trim().length === 0) {
    return 'Assistant name is required'
  }

  if (values.providerId.trim().length === 0) {
    return 'Provider is required'
  }

  if (values.workspacePath.trim().length === 0) {
    return 'Workspace path is required'
  }

  return null
}

export function AssistantEditor({
  providers,
  initialValue,
  isSubmitting,
  onSubmit
}: AssistantEditorProps): React.JSX.Element {
  const [values, setValues] = useState<AssistantEditorValues>(() => toInitialValues(initialValue))
  const [error, setError] = useState<string | null>(null)

  const title = useMemo(() => {
    return initialValue ? 'Edit Assistant' : 'Create Assistant'
  }, [initialValue])

  const handleInput = (key: keyof AssistantEditorValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validate(values)
    setError(validationError)
    if (validationError) {
      return
    }

    await onSubmit({
      name: values.name.trim(),
      providerId: values.providerId,
      workspaceConfig: {
        rootPath: values.workspacePath.trim()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
      <h3 style={{ margin: 0 }}>{title}</h3>

      <label>
        Name
        <input value={values.name} onChange={(event) => handleInput('name', event.target.value)} />
      </label>

      <label>
        Provider
        <select
          value={values.providerId}
          onChange={(event) => handleInput('providerId', event.target.value)}
        >
          <option value="">Select provider</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} ({provider.selectedModel})
            </option>
          ))}
        </select>
      </label>

      <label>
        Workspace Path
        <input
          value={values.workspacePath}
          onChange={(event) => handleInput('workspacePath', event.target.value)}
          placeholder="/Users/name/workspace"
        />
      </label>

      {error ? (
        <p role="alert" style={{ margin: 0, color: '#ff6b6b' }}>
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : initialValue ? 'Update Assistant' : 'Create Assistant'}
      </button>
    </form>
  )
}

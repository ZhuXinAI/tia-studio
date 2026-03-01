import { useMemo, useState } from 'react'
import type { SaveAssistantInput, AssistantRecord } from './assistants-query'
import type { ProviderRecord } from '../settings/providers/providers-query'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h3 className="text-sm font-medium">{title}</h3>

      <div className="space-y-2">
        <Label htmlFor="assistant-name">Name</Label>
        <Input
          id="assistant-name"
          value={values.name}
          onChange={(event) => handleInput('name', event.target.value)}
          placeholder="Research Copilot"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assistant-provider">Provider</Label>
        <select
          id="assistant-provider"
          className="border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="assistant-workspace-path">Workspace Path</Label>
        <Input
          id="assistant-workspace-path"
          value={values.workspacePath}
          onChange={(event) => handleInput('workspacePath', event.target.value)}
          placeholder="/Users/name/workspace"
        />
      </div>

      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : initialValue ? 'Update Assistant' : 'Create Assistant'}
      </Button>
    </form>
  )
}

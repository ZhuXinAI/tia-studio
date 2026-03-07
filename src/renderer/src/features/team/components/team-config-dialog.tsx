import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import type { TeamThreadRecord } from '../team-threads-query'

export type TeamConfigDialogValues = {
  title: string
  teamDescription: string
  supervisorProviderId: string
  supervisorModel: string
  assistantIds: string[]
}

type TeamConfigDialogProps = {
  isOpen: boolean
  thread: TeamThreadRecord | null
  providers: ProviderRecord[]
  assistants: AssistantRecord[]
  selectedAssistantIds: string[]
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onSubmit: (input: TeamConfigDialogValues) => Promise<void>
}

function toggleAssistantId(current: string[], assistantId: string): string[] {
  if (current.includes(assistantId)) {
    return current.filter((item) => item !== assistantId)
  }

  return [...current, assistantId]
}

export function TeamConfigDialog({
  isOpen,
  thread,
  providers,
  assistants,
  selectedAssistantIds,
  isSaving,
  errorMessage,
  onClose,
  onSubmit
}: TeamConfigDialogProps): React.JSX.Element | null {
  const [title, setTitle] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [supervisorProviderId, setSupervisorProviderId] = useState('')
  const [supervisorModel, setSupervisorModel] = useState('')
  const [assistantIds, setAssistantIds] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen || !thread) {
      return
    }

    setTitle(thread.title)
    setTeamDescription(thread.teamDescription)
    setSupervisorProviderId(thread.supervisorProviderId ?? '')
    setSupervisorModel(thread.supervisorModel)
    setAssistantIds(selectedAssistantIds)
    setValidationErrors([])
  }, [isOpen, thread, selectedAssistantIds])

  const sortedAssistants = useMemo(() => {
    return [...assistants].sort((left, right) => left.name.localeCompare(right.name))
  }, [assistants])

  if (!isOpen || !thread) {
    return null
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const nextValidationErrors: string[] = []
    if (supervisorProviderId.trim().length === 0) {
      nextValidationErrors.push('Select a supervisor provider.')
    }
    if (supervisorModel.trim().length === 0) {
      nextValidationErrors.push('Enter a supervisor model.')
    }
    if (assistantIds.length === 0) {
      nextValidationErrors.push('Select at least one team member.')
    }

    setValidationErrors(nextValidationErrors)
    if (nextValidationErrors.length > 0) {
      return
    }

    await onSubmit({
      title: title.trim(),
      teamDescription: teamDescription.trim(),
      supervisorProviderId: supervisorProviderId.trim(),
      supervisorModel: supervisorModel.trim(),
      assistantIds
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close team config dialog"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        disabled={isSaving}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-config-dialog-title"
        className="relative z-10 w-full max-w-3xl"
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle id="team-config-dialog-title">Configure Team</CardTitle>
              <p className="text-muted-foreground text-sm">
                Select a supervisor model and choose which assistants join this Team thread.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close dialog"
              onClick={onClose}
              disabled={isSaving}
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            {validationErrors.length > 0 ? (
              <div className="rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2">
                {validationErrors.map((message) => (
                  <p key={message} role="alert" className="text-sm text-amber-900 dark:text-amber-200">
                    {message}
                  </p>
                ))}
              </div>
            ) : null}

            {errorMessage ? (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Thread Title</span>
                <input
                  id="team-thread-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="border-input w-full rounded-md border bg-transparent px-3 py-2"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium">Supervisor Provider</span>
                <select
                  id="team-supervisor-provider"
                  value={supervisorProviderId}
                  onChange={(event) => setSupervisorProviderId(event.target.value)}
                  className="border-input w-full rounded-md border bg-transparent px-3 py-2"
                >
                  <option value="">Select provider</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">Team Description</span>
              <textarea
                id="team-description"
                value={teamDescription}
                onChange={(event) => setTeamDescription(event.target.value)}
                rows={4}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">Supervisor Model</span>
              <input
                id="team-supervisor-model"
                value={supervisorModel}
                onChange={(event) => setSupervisorModel(event.target.value)}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2"
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Team Members</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedAssistants.map((assistant) => (
                  <label
                    key={assistant.id}
                    className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={assistantIds.includes(assistant.id)}
                      onChange={() =>
                        setAssistantIds((current) => toggleAssistantId(current, assistant.id))
                      }
                    />
                    <span>{assistant.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                Save Team
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

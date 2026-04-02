import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import type { TeamWorkspaceRecord } from '../team-workspaces-query'

export type TeamConfigDialogValues = {
  teamDescription: string
  supervisorProviderId: string
  supervisorModel: string
  assistantIds: string[]
}

type TeamConfigDialogProps = {
  isOpen: boolean
  workspace: TeamWorkspaceRecord | null
  providers: ProviderRecord[]
  assistants: AssistantRecord[]
  selectedAssistantIds: string[]
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onCreateAcpMember?: () => void
  onCreateTiaMember?: () => void
  onSubmit: (input: TeamConfigDialogValues) => Promise<void>
}

function toggleAssistantId(current: string[], assistantId: string): string[] {
  if (current.includes(assistantId)) {
    return current.filter((item) => item !== assistantId)
  }

  return [...current, assistantId]
}

function resolveAssistantOriginLabel(
  assistant: Pick<AssistantRecord, 'origin'>,
  t: (key: string) => string
): string {
  return assistant.origin === 'external-acp'
    ? t('team.configDialog.origins.acp')
    : t('team.configDialog.origins.tia')
}

export function TeamConfigDialog({
  isOpen,
  workspace,
  providers,
  assistants,
  selectedAssistantIds,
  isSaving,
  errorMessage,
  onClose,
  onCreateAcpMember,
  onCreateTiaMember,
  onSubmit
}: TeamConfigDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [teamDescription, setTeamDescription] = useState('')
  const [supervisorProviderId, setSupervisorProviderId] = useState('')
  const [supervisorModel, setSupervisorModel] = useState('')
  const [assistantIds, setAssistantIds] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen || !workspace) {
      return
    }

    setTeamDescription(workspace.teamDescription)
    setSupervisorProviderId(workspace.supervisorProviderId ?? '')
    setSupervisorModel(workspace.supervisorModel)
    setAssistantIds(selectedAssistantIds)
    setValidationErrors([])
  }, [isOpen, workspace, selectedAssistantIds])

  const sortedAssistants = useMemo(() => {
    return [...assistants].sort((left, right) => left.name.localeCompare(right.name))
  }, [assistants])

  if (!isOpen || !workspace) {
    return null
  }

  const isBuiltInDefaultWorkspace = workspace.isBuiltInDefault === true

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const nextValidationErrors: string[] = []
    if (supervisorProviderId.trim().length === 0) {
      nextValidationErrors.push(t('team.configDialog.validation.supervisorProvider'))
    }
    if (supervisorModel.trim().length === 0) {
      nextValidationErrors.push(t('team.configDialog.validation.supervisorModel'))
    }
    if (!isBuiltInDefaultWorkspace && assistantIds.length === 0) {
      nextValidationErrors.push(t('team.configDialog.validation.members'))
    }

    setValidationErrors(nextValidationErrors)
    if (nextValidationErrors.length > 0) {
      return
    }

    await onSubmit({
      teamDescription: teamDescription.trim(),
      supervisorProviderId: supervisorProviderId.trim(),
      supervisorModel: supervisorModel.trim(),
      assistantIds: isBuiltInDefaultWorkspace
        ? sortedAssistants.map((assistant) => assistant.id)
        : assistantIds
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('team.configDialog.closeAriaLabel')}
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
              <CardTitle id="team-config-dialog-title">{t('team.configDialog.title')}</CardTitle>
              <p className="text-muted-foreground text-sm">{t('team.configDialog.description')}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('common.actions.close')}
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
                  <p
                    key={message}
                    role="alert"
                    className="text-sm text-amber-900 dark:text-amber-200"
                  >
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
                <span className="font-medium">
                  {t('team.configDialog.fields.supervisorProvider')}
                </span>
                <select
                  id="team-supervisor-provider"
                  value={supervisorProviderId}
                  onChange={(event) => setSupervisorProviderId(event.target.value)}
                  className="border-input w-full rounded-md border bg-transparent px-3 py-2"
                >
                  <option value="">{t('team.configDialog.selectProvider')}</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t('team.configDialog.fields.teamDescription')}</span>
              <textarea
                id="team-description"
                value={teamDescription}
                onChange={(event) => setTeamDescription(event.target.value)}
                rows={4}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t('team.configDialog.fields.supervisorModel')}</span>
              <input
                id="team-supervisor-model"
                value={supervisorModel}
                onChange={(event) => setSupervisorModel(event.target.value)}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2"
              />
            </label>

            {!isBuiltInDefaultWorkspace ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  {t('team.configDialog.fields.teamMembers')}
                </legend>
                <p className="text-muted-foreground text-xs">
                  {t('team.configDialog.memberOriginHint')}
                </p>
                {onCreateAcpMember && onCreateTiaMember ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {t('team.configDialog.createMemberHint')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 rounded-full px-3"
                      onClick={onCreateAcpMember}
                      disabled={isSaving}
                    >
                      {t('team.configDialog.createAcpMemberAction')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3"
                      onClick={onCreateTiaMember}
                      disabled={isSaving}
                    >
                      {t('team.configDialog.createTiaMemberAction')}
                    </Button>
                  </div>
                ) : null}
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
                      <span className="min-w-0 flex-1 truncate">{assistant.name}</span>
                      <span className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">
                        {resolveAssistantOriginLabel(assistant, t)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                {t('common.actions.cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {t('team.configDialog.saveButton')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

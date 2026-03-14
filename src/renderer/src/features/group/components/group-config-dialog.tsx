import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { GroupRecord } from '../group-groups-query'

export type GroupConfigDialogValues = {
  name: string
  groupDescription: string
  maxAutoTurns: number
  assistantIds: string[]
}

export type GroupConfigDialogMode = 'create' | 'edit'

type GroupConfigDialogProps = {
  mode: GroupConfigDialogMode
  isOpen: boolean
  group: GroupRecord | null
  assistants: AssistantRecord[]
  selectedAssistantIds: string[]
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onSubmit: (input: GroupConfigDialogValues) => Promise<void>
}

function toggleAssistantId(current: string[], assistantId: string): string[] {
  if (current.includes(assistantId)) {
    return current.filter((item) => item !== assistantId)
  }

  return [...current, assistantId]
}

export function GroupConfigDialog({
  mode,
  isOpen,
  group,
  assistants,
  selectedAssistantIds,
  isSaving,
  errorMessage,
  onClose,
  onSubmit
}: GroupConfigDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const isCreateMode = mode === 'create'
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [maxAutoTurns, setMaxAutoTurns] = useState('6')
  const [assistantIds, setAssistantIds] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (isCreateMode) {
      setGroupName('')
      setGroupDescription('')
      setMaxAutoTurns('6')
      setAssistantIds(selectedAssistantIds)
      setValidationErrors([])
      return
    }

    if (!group) {
      return
    }

    setGroupName(group.name)
    setGroupDescription(group.groupDescription)
    setMaxAutoTurns(String(group.maxAutoTurns))
    setAssistantIds(selectedAssistantIds)
    setValidationErrors([])
  }, [group, isCreateMode, isOpen, selectedAssistantIds])

  const sortedAssistants = useMemo(() => {
    return [...assistants].sort((left, right) => left.name.localeCompare(right.name))
  }, [assistants])

  if (!isOpen || (!isCreateMode && !group)) {
    return null
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const parsedMaxAutoTurns = Number.parseInt(maxAutoTurns, 10)
    const nextValidationErrors: string[] = []

    if (groupName.trim().length === 0) {
      nextValidationErrors.push(t('group.configDialog.validation.name'))
    }
    if (
      !isCreateMode &&
      (!Number.isFinite(parsedMaxAutoTurns) || parsedMaxAutoTurns < 1 || parsedMaxAutoTurns > 12)
    ) {
      nextValidationErrors.push(t('group.configDialog.validation.maxAutoTurns'))
    }
    if (assistantIds.length === 0) {
      nextValidationErrors.push(t('group.configDialog.validation.members'))
    }

    setValidationErrors(nextValidationErrors)
    if (nextValidationErrors.length > 0) {
      return
    }

    await onSubmit({
      name: groupName.trim(),
      groupDescription: groupDescription.trim(),
      maxAutoTurns: isCreateMode ? 6 : parsedMaxAutoTurns,
      assistantIds
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('group.configDialog.closeAriaLabel')}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        disabled={isSaving}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-config-dialog-title"
        className="relative z-10 w-full max-w-3xl"
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle id="group-config-dialog-title">
                {isCreateMode
                  ? t('group.configDialog.createTitle')
                  : t('group.configDialog.title')}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {isCreateMode
                  ? t('group.configDialog.createDescription')
                  : t('group.configDialog.description')}
              </p>
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

            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t('group.configDialog.fields.name')}</span>
              <input
                id="group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2"
              />
            </label>

            {!isCreateMode ? (
              <>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">
                    {t('group.configDialog.fields.groupDescription')}
                  </span>
                  <textarea
                    id="group-description"
                    value={groupDescription}
                    onChange={(event) => setGroupDescription(event.target.value)}
                    rows={4}
                    className="border-input w-full rounded-md border bg-transparent px-3 py-2"
                  />
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="font-medium">{t('group.configDialog.fields.maxAutoTurns')}</span>
                  <input
                    id="group-max-auto-turns"
                    type="number"
                    min={1}
                    max={12}
                    value={maxAutoTurns}
                    onChange={(event) => setMaxAutoTurns(event.target.value)}
                    className="border-input w-full rounded-md border bg-transparent px-3 py-2"
                  />
                </label>
              </>
            ) : null}

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t('group.configDialog.fields.members')}</legend>
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
                {t('common.actions.cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isCreateMode
                  ? t('group.configDialog.createButton')
                  : t('group.configDialog.saveButton')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

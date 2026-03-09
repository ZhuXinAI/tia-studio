import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { SaveAssistantInput, AssistantRecord } from './assistants-query'
import type { ProviderRecord } from '../settings/providers/providers-query'
import type { McpServerRecord } from '../settings/mcp-servers/mcp-servers-query'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Field, FieldLabel } from '../../components/ui/field'
import { cn } from '../../lib/utils'
import { useTranslation } from '../../i18n/use-app-translation'
import { ModelPickerDialog } from './model-picker-dialog'
import {
  getManagedRuntimeStatus,
  getRequiredManagedRuntimeKind,
  isManagedRuntimeReady,
  type ManagedRuntimesState
} from '../settings/runtimes/managed-runtimes-query'

type AssistantEditorValues = {
  name: string
  description: string
  instructions: string
  providerId: string
  workspacePath: string
  maxSteps: string
  mcpConfig: Record<string, boolean>
}

type AssistantEditorTab = 'essential' | 'tools'

type AssistantEditorProps = {
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  initialValue?: AssistantRecord | null
  isSubmitting?: boolean
  onSelectWorkspacePath?: () => Promise<string | null> | string | null
  onSubmit: (input: SaveAssistantInput) => Promise<void> | void
}

function toBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .map(([key, rawValue]) => {
      const normalizedKey = key.trim()
      if (normalizedKey.length === 0) {
        return null
      }

      if (typeof rawValue === 'boolean') {
        return [normalizedKey, rawValue] as const
      }

      if (typeof rawValue === 'number') {
        return [normalizedKey, rawValue !== 0] as const
      }

      if (typeof rawValue === 'string') {
        const normalizedValue = rawValue.trim().toLowerCase()
        if (normalizedValue === 'true' || normalizedValue === '1') {
          return [normalizedKey, true] as const
        }

        if (normalizedValue === 'false' || normalizedValue === '0') {
          return [normalizedKey, false] as const
        }
      }

      return null
    })
    .filter((entry): entry is readonly [string, boolean] => entry !== null)

  return Object.fromEntries(entries)
}

function toInitialValues(
  initialValue: AssistantRecord | null | undefined,
  mcpServers: Record<string, McpServerRecord>
): AssistantEditorValues {
  const initialMaxSteps =
    typeof initialValue?.maxSteps === 'number' &&
    Number.isInteger(initialValue.maxSteps) &&
    initialValue.maxSteps > 0
      ? initialValue.maxSteps
      : 100

  const assistantMcpConfig = toBooleanMap(initialValue?.mcpConfig)
  const allMcpServerConfig: Record<string, boolean> = {
    ...assistantMcpConfig
  }

  for (const serverId of Object.keys(mcpServers)) {
    if (allMcpServerConfig[serverId] === undefined) {
      allMcpServerConfig[serverId] = false
    }
  }

  return {
    name: initialValue?.name ?? '',
    description: initialValue?.description ?? '',
    instructions: initialValue?.instructions ?? '',
    providerId: initialValue?.providerId ?? '',
    workspacePath:
      typeof initialValue?.workspaceConfig?.rootPath === 'string'
        ? (initialValue.workspaceConfig.rootPath as string)
        : '',
    maxSteps: String(initialMaxSteps),
    mcpConfig: allMcpServerConfig
  }
}

function parseMaxSteps(rawValue: string): number | null {
  const normalized = rawValue.trim()
  if (normalized.length === 0) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null
  }

  return parsed
}

function validate(values: AssistantEditorValues, t: (key: string) => string): string | null {
  if (values.name.trim().length === 0) {
    return t('assistants.editor.errors.nameRequired')
  }

  if (values.providerId.trim().length === 0) {
    return t('assistants.editor.errors.providerRequired')
  }

  if (!parseMaxSteps(values.maxSteps)) {
    return t('assistants.editor.errors.maxStepsInvalid')
  }

  return null
}

export function AssistantEditor({
  providers,
  mcpServers,
  initialValue,
  isSubmitting,
  onSelectWorkspacePath,
  onSubmit
}: AssistantEditorProps): React.JSX.Element {
  const { t } = useTranslation()
  const [values, setValues] = useState<AssistantEditorValues>(() =>
    toInitialValues(initialValue, mcpServers)
  )
  const [activeTab, setActiveTab] = useState<AssistantEditorTab>('essential')
  const [error, setError] = useState<string | null>(null)
  const [isSelectingWorkspacePath, setIsSelectingWorkspacePath] = useState(false)
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false)
  const [managedRuntimeState, setManagedRuntimeState] = useState<ManagedRuntimesState | null>(null)

  const title = useMemo(() => {
    return initialValue ? t('assistants.editor.editTitle') : t('assistants.editor.createTitle')
  }, [initialValue, t])

  const selectedProvider = useMemo(() => {
    return providers.find((provider) => provider.id === values.providerId) ?? null
  }, [providers, values.providerId])

  const mcpServerEntries = useMemo(() => {
    return Object.entries(mcpServers).sort(([left], [right]) => left.localeCompare(right))
  }, [mcpServers])

  const runtimeBackedServerEntries = useMemo(() => {
    return mcpServerEntries.filter(([, server]) => getRequiredManagedRuntimeKind(server.command))
  }, [mcpServerEntries])

  const shouldShowManagedRuntimeNote = useMemo(() => {
    if (runtimeBackedServerEntries.length === 0) {
      return false
    }

    if (!managedRuntimeState) {
      return true
    }

    return runtimeBackedServerEntries.some(([, server]) => {
      const requiredRuntime = getRequiredManagedRuntimeKind(server.command)
      return requiredRuntime ? !isManagedRuntimeReady(managedRuntimeState[requiredRuntime]) : false
    })
  }, [managedRuntimeState, runtimeBackedServerEntries])

  useEffect(() => {
    let isCancelled = false

    void getManagedRuntimeStatus()
      .then((nextState) => {
        if (!isCancelled) {
          setManagedRuntimeState(nextState)
        }
      })
      .catch(() => undefined)

    return () => {
      isCancelled = true
    }
  }, [])

  const handleInput = (key: keyof AssistantEditorValues, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleMcpToggle = (serverId: string): void => {
    setValues((current) => ({
      ...current,
      mcpConfig: {
        ...current.mcpConfig,
        [serverId]: !current.mcpConfig[serverId]
      }
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const validationError = validate(values, t)
    setError(validationError)
    if (validationError) {
      return
    }

    const maxSteps = parseMaxSteps(values.maxSteps) ?? 100
    const nextMcpConfig: Record<string, boolean> = {
      ...values.mcpConfig
    }
    for (const [serverId] of mcpServerEntries) {
      nextMcpConfig[serverId] = values.mcpConfig[serverId] === true
    }

    const workspacePath = values.workspacePath.trim()

    await onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      instructions: values.instructions.trim(),
      providerId: values.providerId,
      workspaceConfig: workspacePath.length > 0 ? {
        rootPath: workspacePath
      } : undefined,
      mcpConfig: nextMcpConfig,
      maxSteps
    })
  }

  const handleSelectWorkspacePath = async (): Promise<void> => {
    if (!onSelectWorkspacePath || isSelectingWorkspacePath) {
      return
    }

    setError(null)
    setIsSelectingWorkspacePath(true)
    try {
      const selectedPath = await onSelectWorkspacePath()
      if (typeof selectedPath === 'string' && selectedPath.trim().length > 0) {
        handleInput('workspacePath', selectedPath.trim())
      }
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : t('assistants.editor.errors.workspacePickerFailed')
      )
    } finally {
      setIsSelectingWorkspacePath(false)
    }
  }

  return (
    <form className="py-4" onSubmit={handleSubmit}>
      <h3 className="text-sm font-medium">{title}</h3>

      <div className="grid gap-4 md:grid-cols-[176px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card/40 p-2">
          <button
            type="button"
            className={cn(
              'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
              activeTab === 'essential'
                ? 'bg-secondary text-secondary-foreground'
                : 'hover:bg-accent/40'
            )}
            onClick={() => setActiveTab('essential')}
          >
            {t('assistants.editor.tabs.essential')}
          </button>
          <button
            type="button"
            className={cn(
              'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
              activeTab === 'tools'
                ? 'bg-secondary text-secondary-foreground'
                : 'hover:bg-accent/40'
            )}
            onClick={() => setActiveTab('tools')}
          >
            {t('assistants.editor.tabs.tools')}
          </button>
        </aside>

        <div data-testid="assistant-editor-panel" className="h-[32rem] overflow-y-auto py-4 pr-1">
          {activeTab === 'essential' ? (
            <div className="space-y-4">
              <Field>
                <FieldLabel htmlFor="assistant-name">{t('assistants.editor.fields.name')}</FieldLabel>
                <Input
                  id="assistant-name"
                  value={values.name}
                  onChange={(event) => handleInput('name', event.target.value)}
                  placeholder={t('assistants.editor.placeholders.name')}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="assistant-provider">{t('assistants.editor.fields.provider')}</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between h-9 font-normal"
                  onClick={() => setIsModelPickerOpen(true)}
                >
                  <span className="truncate">
                    {selectedProvider
                      ? `${selectedProvider.name} (${selectedProvider.selectedModel})`
                      : t('assistants.editor.selectProvider')}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </Field>

              <Field>
                <FieldLabel htmlFor="assistant-description">{t('assistants.editor.fields.description')}</FieldLabel>
                <p className="text-muted-foreground text-xs mb-2">
                  {t('assistants.editor.descriptionHelp')}
                </p>
                <Textarea
                  id="assistant-description"
                  rows={2}
                  value={values.description}
                  onChange={(event) => handleInput('description', event.target.value)}
                  placeholder={t('assistants.editor.placeholders.description')}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="assistant-prompt">{t('assistants.editor.fields.prompt')}</FieldLabel>
                <Textarea
                  id="assistant-prompt"
                  rows={4}
                  value={values.instructions}
                  onChange={(event) => handleInput('instructions', event.target.value)}
                  placeholder={t('assistants.editor.placeholders.prompt')}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="assistant-workspace-path">
                  {t('assistants.editor.fields.workspacePath')}
                </FieldLabel>
                <p className="text-muted-foreground text-xs mb-2">
                  {t('assistants.editor.workspacePathHelp')}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    id="assistant-workspace-path"
                    value={values.workspacePath}
                    onChange={(event) => handleInput('workspacePath', event.target.value)}
                    placeholder={t('assistants.editor.placeholders.workspacePath')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || isSelectingWorkspacePath || !onSelectWorkspacePath}
                    onClick={() => void handleSelectWorkspacePath()}
                  >
                    {isSelectingWorkspacePath
                      ? t('assistants.editor.openingButton')
                      : t('common.actions.browse')}
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="assistant-max-steps">
                  {t('assistants.editor.fields.maxSteps')}
                </FieldLabel>
                <Input
                  id="assistant-max-steps"
                  type="number"
                  min={1}
                  step={1}
                  value={values.maxSteps}
                  onChange={(event) => handleInput('maxSteps', event.target.value)}
                  placeholder={t('assistants.editor.placeholders.maxSteps')}
                />
              </Field>
            </div>
          ) : null}

          {activeTab === 'tools' ? (
            <div className="space-y-3">
              {shouldShowManagedRuntimeNote ? (
                <div className="rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {t('assistants.editor.runtimeNoteTitle')}
                  </p>
                  <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                    {t('assistants.editor.runtimeNotePrefix')}{' '}
                    <Link className="underline underline-offset-2" to="/settings/runtimes">
                      {t('assistants.editor.runtimeNoteLinkLabel')}
                    </Link>
                    . {t('assistants.editor.runtimeNoteSuffix')}
                  </p>
                </div>
              ) : null}

              {mcpServerEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('assistants.editor.noMcpServersPrefix')}{' '}
                  <Link className="underline underline-offset-2" to="/settings/mcp-servers">
                    {t('assistants.editor.noMcpServersLinkLabel')}
                  </Link>
                  .
                </p>
              ) : (
                mcpServerEntries.map(([serverId, server]) => {
                  const isEnabled = values.mcpConfig[serverId] ?? false

                  return (
                    <article
                      key={serverId}
                      className={cn(
                        'rounded-xl border px-4 py-3',
                        isEnabled
                          ? 'border-primary/70 bg-primary/10'
                          : 'border-border/70 bg-card/50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="text-base font-medium">{server.name || serverId}</h4>
                          <p className="text-muted-foreground text-xs">
                            {server.type.toUpperCase()}{' '}
                            {server.command ? `· ${server.command}` : ''}
                          </p>
                          {!server.isActive ? (
                            <p className="text-amber-400 text-xs">
                              {t('assistants.editor.mcpGloballyDisabled')}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label={t('assistants.editor.toggleMcpAriaLabel', {
                            serverId
                          })}
                          aria-checked={isEnabled}
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                            isEnabled
                              ? 'border-emerald-400/80 bg-emerald-500/30'
                              : 'border-border/80 bg-background/80'
                          )}
                          onClick={() => handleMcpToggle(serverId)}
                          disabled={isSubmitting}
                        >
                          <span
                            className={cn(
                              'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                              isEnabled ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t('assistants.editor.savingButton')
            : initialValue
              ? t('assistants.editor.updateButton')
              : t('assistants.editor.createButton')}
        </Button>
      </div>

      <ModelPickerDialog
        open={isModelPickerOpen}
        providers={providers}
        selectedProviderId={values.providerId}
        onSelect={(providerId) => handleInput('providerId', providerId)}
        onOpenChange={setIsModelPickerOpen}
      />
    </form>
  )
}

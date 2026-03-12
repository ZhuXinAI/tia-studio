import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type {
  AssistantCodingApprovalMode,
  AssistantCodingSandboxMode,
  SaveAssistantInput,
  AssistantRecord
} from './assistants-query'
import {
  DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES,
  DEFAULT_ASSISTANT_HEARTBEAT_PROMPT,
  getAssistantHeartbeat,
  type AssistantHeartbeatRecord,
  type SaveAssistantHeartbeatInput
} from './assistant-heartbeat-query'
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
import {
  listAssistantSkills,
  removeAssistantWorkspaceSkill,
  type AssistantSkillRecord,
  type AssistantSkillSource
} from './assistant-skills-query'
import { getCodexCliStatus, type CodexCliStatus } from './codex-cli-query'

type AssistantEditorValues = {
  name: string
  description: string
  instructions: string
  providerId: string
  workspacePath: string
  maxSteps: string
  mcpConfig: Record<string, boolean>
  coding: AssistantCodingValues
}

type AssistantHeartbeatValues = {
  enabled: boolean
  intervalMinutes: string
  prompt: string
}

type AssistantCodingValues = {
  enabled: boolean
  cwd: string
  addDirs: string
  skipGitRepoCheck: boolean
  fullAuto: boolean
  approvalMode: AssistantCodingApprovalMode
  sandboxMode: AssistantCodingSandboxMode
}

type AssistantEditorTab = 'essential' | 'tools' | 'skills' | 'coding'

type AssistantEditorProps = {
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  initialValue?: AssistantRecord | null
  isSubmitting?: boolean
  onSelectWorkspacePath?: () => Promise<string | null> | string | null
  onSubmit: (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null
  ) => Promise<void> | void
}

const codingApprovalModes: AssistantCodingApprovalMode[] = [
  'untrusted',
  'on-failure',
  'on-request',
  'never'
]

const codingSandboxModes: AssistantCodingSandboxMode[] = [
  'read-only',
  'workspace-write',
  'danger-full-access'
]

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

  const codingConfig =
    initialValue?.codingConfig && typeof initialValue.codingConfig === 'object'
      ? initialValue.codingConfig
      : undefined
  const initialCodingApprovalMode = codingApprovalModes.includes(
    codingConfig?.approvalMode ?? 'on-failure'
  )
    ? (codingConfig?.approvalMode ?? 'on-failure')
    : 'on-failure'
  const initialCodingSandboxMode = codingSandboxModes.includes(
    codingConfig?.sandboxMode ?? 'workspace-write'
  )
    ? (codingConfig?.sandboxMode ?? 'workspace-write')
    : 'workspace-write'

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
    mcpConfig: allMcpServerConfig,
    coding: {
      enabled: codingConfig?.enabled === true,
      cwd: typeof codingConfig?.cwd === 'string' ? codingConfig.cwd : '',
      addDirs: Array.isArray(codingConfig?.addDirs) ? codingConfig.addDirs.join('\n') : '',
      skipGitRepoCheck: codingConfig?.skipGitRepoCheck ?? true,
      fullAuto: codingConfig?.fullAuto === true,
      approvalMode: initialCodingApprovalMode,
      sandboxMode: initialCodingSandboxMode
    }
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

function toInitialHeartbeatValues(
  heartbeat: AssistantHeartbeatRecord | null | undefined
): AssistantHeartbeatValues {
  return {
    enabled: heartbeat?.enabled ?? false,
    intervalMinutes: String(
      heartbeat?.intervalMinutes ?? DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES
    ),
    prompt: heartbeat?.prompt ?? DEFAULT_ASSISTANT_HEARTBEAT_PROMPT
  }
}

function parseHeartbeatIntervalMinutes(rawValue: string): number | null {
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

function parseAddDirs(rawValue: string): string[] {
  const uniquePaths = new Set<string>()

  for (const segment of rawValue.split('\n')) {
    const normalized = segment.trim()
    if (normalized.length > 0) {
      uniquePaths.add(normalized)
    }
  }

  return [...uniquePaths]
}

function buildCodingConfig(
  values: AssistantCodingValues,
  codexCliAvailable: boolean | null
): SaveAssistantInput['codingConfig'] {
  if (!values.enabled) {
    return {}
  }

  const cwd = values.cwd.trim()
  const addDirs = parseAddDirs(values.addDirs)

  return {
    ...(codexCliAvailable !== false ? { enabled: true } : {}),
    ...(cwd.length > 0 ? { cwd } : {}),
    ...(addDirs.length > 0 ? { addDirs } : {}),
    skipGitRepoCheck: values.skipGitRepoCheck,
    fullAuto: values.fullAuto,
    approvalMode: values.approvalMode,
    sandboxMode: values.sandboxMode
  }
}

function toErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof Error) {
    const normalized = error.message.trim()
    return normalized.length > 0 ? normalized : t('common.errors.unexpectedRequest')
  }

  return t('common.errors.unexpectedRequest')
}

function getSkillSourceLabel(source: AssistantSkillSource, t: (key: string) => string): string {
  if (source === 'workspace') {
    return t('assistants.editor.skillSources.workspace')
  }

  if (source === 'global-claude') {
    return t('assistants.editor.skillSources.globalClaude')
  }

  return t('assistants.editor.skillSources.globalAgent')
}

function validate(
  values: AssistantEditorValues,
  heartbeatValues: AssistantHeartbeatValues | null,
  codexCliAvailable: boolean | null,
  t: (key: string) => string
): string | null {
  if (values.name.trim().length === 0) {
    return t('assistants.editor.errors.nameRequired')
  }

  if (values.providerId.trim().length === 0) {
    return t('assistants.editor.errors.providerRequired')
  }

  if (!parseMaxSteps(values.maxSteps)) {
    return t('assistants.editor.errors.maxStepsInvalid')
  }

  if (values.coding.enabled && codexCliAvailable !== false) {
    const codingCwd = values.coding.cwd.trim()
    const workspacePath = values.workspacePath.trim()
    if (codingCwd.length === 0 && workspacePath.length === 0) {
      return t('assistants.editor.coding.errors.cwdRequired')
    }
  }

  if (heartbeatValues) {
    if (!parseHeartbeatIntervalMinutes(heartbeatValues.intervalMinutes)) {
      return t('assistants.editor.heartbeat.errors.intervalInvalid')
    }

    if (heartbeatValues.prompt.trim().length === 0) {
      return t('assistants.editor.heartbeat.errors.promptRequired')
    }
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
  const [codexCliStatus, setCodexCliStatus] = useState<CodexCliStatus | null>(null)
  const [skills, setSkills] = useState<AssistantSkillRecord[]>([])
  const [isSkillsLoading, setIsSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState<string | null>(null)
  const [removingSkillId, setRemovingSkillId] = useState<string | null>(null)
  const [heartbeatValues, setHeartbeatValues] = useState<AssistantHeartbeatValues>(() =>
    toInitialHeartbeatValues(null)
  )
  const [initialHeartbeatValues, setInitialHeartbeatValues] = useState<AssistantHeartbeatValues>(
    () => toInitialHeartbeatValues(null)
  )
  const [isHeartbeatLoading, setIsHeartbeatLoading] = useState(false)
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null)

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

  const codexCliAvailable = codexCliStatus?.available ?? null
  const isCodexCliChecking = codexCliAvailable === null
  const isCodexCliUnavailable = codexCliAvailable === false
  const isCodingControlsDisabled = isSubmitting || codexCliAvailable !== true
  const isCodingAgentEnabled = values.coding.enabled && codexCliAvailable !== false

  useEffect(() => {
    if (activeTab !== 'skills') {
      return
    }

    const workspaceRootPath = values.workspacePath.trim()
    if (workspaceRootPath.length === 0) {
      setSkills([])
      setSkillsError(null)
      setIsSkillsLoading(false)
      return
    }

    let isCancelled = false
    setIsSkillsLoading(true)
    setSkillsError(null)

    void listAssistantSkills(workspaceRootPath)
      .then((loadedSkills) => {
        if (!isCancelled) {
          setSkills(loadedSkills)
        }
      })
      .catch((loadError) => {
        if (!isCancelled) {
          setSkills([])
          setSkillsError(toErrorMessage(loadError, t))
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsSkillsLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [activeTab, t, values.workspacePath])

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

  useEffect(() => {
    let isCancelled = false

    void getCodexCliStatus()
      .then((nextStatus) => {
        if (!isCancelled) {
          setCodexCliStatus(nextStatus)
        }
      })
      .catch((statusError) => {
        if (!isCancelled) {
          setCodexCliStatus({
            available: false,
            version: null,
            errorMessage: toErrorMessage(statusError, t)
          })
        }
      })

    return () => {
      isCancelled = true
    }
  }, [t])

  useEffect(() => {
    let isCancelled = false

    if (!initialValue) {
      const nextValues = toInitialHeartbeatValues(null)
      setHeartbeatValues(nextValues)
      setInitialHeartbeatValues(nextValues)
      setHeartbeatError(null)
      setIsHeartbeatLoading(false)
      return
    }

    const workspaceRootPath =
      typeof initialValue.workspaceConfig?.rootPath === 'string'
        ? initialValue.workspaceConfig.rootPath.trim()
        : ''

    if (workspaceRootPath.length === 0) {
      const nextValues = toInitialHeartbeatValues(null)
      setHeartbeatValues(nextValues)
      setInitialHeartbeatValues(nextValues)
      setHeartbeatError(null)
      setIsHeartbeatLoading(false)
      return
    }

    setHeartbeatError(null)
    setIsHeartbeatLoading(true)

    void getAssistantHeartbeat(initialValue.id)
      .then((heartbeat) => {
        if (isCancelled) {
          return
        }

        const nextValues = toInitialHeartbeatValues(heartbeat)
        setHeartbeatValues(nextValues)
        setInitialHeartbeatValues(nextValues)
      })
      .catch((loadError) => {
        if (isCancelled) {
          return
        }

        const nextValues = toInitialHeartbeatValues(null)
        setHeartbeatValues(nextValues)
        setInitialHeartbeatValues(nextValues)
        setHeartbeatError(toErrorMessage(loadError, t))
      })
      .finally(() => {
        if (!isCancelled) {
          setIsHeartbeatLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [initialValue, t])

  const handleInput = (key: keyof AssistantEditorValues, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleHeartbeatInput = <K extends keyof AssistantHeartbeatValues>(
    key: K,
    value: AssistantHeartbeatValues[K]
  ): void => {
    setHeartbeatValues((current) => ({
      ...current,
      [key]: value
    }))
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

  const handleCodingInput = <K extends keyof AssistantCodingValues>(
    key: K,
    value: AssistantCodingValues[K]
  ): void => {
    setValues((current) => ({
      ...current,
      coding: {
        ...current.coding,
        [key]: value
      }
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const validationError = validate(
      values,
      initialValue ? heartbeatValues : null,
      codexCliAvailable,
      t
    )
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
    const initialHeartbeatInput = {
      enabled: initialHeartbeatValues.enabled,
      intervalMinutes:
        parseHeartbeatIntervalMinutes(initialHeartbeatValues.intervalMinutes) ??
        DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES,
      prompt: initialHeartbeatValues.prompt.trim()
    }
    const nextHeartbeatInput =
      initialValue && parseHeartbeatIntervalMinutes(heartbeatValues.intervalMinutes)
        ? {
            enabled: heartbeatValues.enabled,
            intervalMinutes: parseHeartbeatIntervalMinutes(heartbeatValues.intervalMinutes) ?? 0,
            prompt: heartbeatValues.prompt.trim()
          }
        : null
    const heartbeatInput =
      nextHeartbeatInput &&
      (nextHeartbeatInput.enabled !== initialHeartbeatInput.enabled ||
        nextHeartbeatInput.intervalMinutes !== initialHeartbeatInput.intervalMinutes ||
        nextHeartbeatInput.prompt !== initialHeartbeatInput.prompt)
        ? nextHeartbeatInput
        : null

    await onSubmit(
      {
        name: values.name.trim(),
        description: values.description.trim(),
        instructions: values.instructions.trim(),
        providerId: values.providerId,
        workspaceConfig:
          workspacePath.length > 0
            ? {
                rootPath: workspacePath
              }
            : undefined,
        codingConfig: buildCodingConfig(values.coding, codexCliAvailable),
        mcpConfig: nextMcpConfig,
        maxSteps
      },
      heartbeatInput
    )
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

  const handleRemoveWorkspaceSkill = async (skill: AssistantSkillRecord): Promise<void> => {
    if (!skill.canDelete || removingSkillId || isSubmitting) {
      return
    }

    const workspaceRootPath = values.workspacePath.trim()
    if (workspaceRootPath.length === 0) {
      return
    }

    setSkillsError(null)
    setRemovingSkillId(skill.id)
    try {
      await removeAssistantWorkspaceSkill({
        workspaceRootPath,
        relativePath: skill.relativePath
      })

      const refreshedSkills = await listAssistantSkills(workspaceRootPath)
      setSkills(refreshedSkills)
    } catch (removeError) {
      setSkillsError(toErrorMessage(removeError, t))
    } finally {
      setRemovingSkillId(null)
    }
  }

  return (
    <form className="py-4" onSubmit={handleSubmit}>
      <h3 className="text-sm font-medium mb-2">{title}</h3>

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
          <button
            type="button"
            className={cn(
              'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
              activeTab === 'skills'
                ? 'bg-secondary text-secondary-foreground'
                : 'hover:bg-accent/40'
            )}
            onClick={() => setActiveTab('skills')}
          >
            {t('assistants.editor.tabs.skills')}
          </button>
          <button
            type="button"
            className={cn(
              'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
              activeTab === 'coding'
                ? 'bg-secondary text-secondary-foreground'
                : 'hover:bg-accent/40'
            )}
            onClick={() => setActiveTab('coding')}
          >
            {t('assistants.editor.tabs.coding')}
          </button>
        </aside>

        <div data-testid="assistant-editor-panel" className="h-[32rem] overflow-y-auto py-4 px-1">
          {activeTab === 'essential' ? (
            <div className="space-y-4">
              <Field>
                <FieldLabel htmlFor="assistant-name">
                  {t('assistants.editor.fields.name')}
                </FieldLabel>
                <Input
                  id="assistant-name"
                  value={values.name}
                  onChange={(event) => handleInput('name', event.target.value)}
                  placeholder={t('assistants.editor.placeholders.name')}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="assistant-provider">
                  {t('assistants.editor.fields.provider')}
                </FieldLabel>
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
                <FieldLabel htmlFor="assistant-description">
                  {t('assistants.editor.fields.description')}
                </FieldLabel>
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
                <FieldLabel htmlFor="assistant-prompt">
                  {t('assistants.editor.fields.prompt')}
                </FieldLabel>
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

              {initialValue ? (
                <section className="space-y-3 rounded-xl border border-border/70 bg-card/50 p-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-medium">
                      {t('assistants.editor.heartbeat.title')}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t('assistants.editor.heartbeat.description')}
                    </p>
                  </div>

                  {values.workspacePath.trim().length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t('assistants.editor.heartbeat.workspaceRequired')}
                    </p>
                  ) : null}

                  {isHeartbeatLoading ? (
                    <p className="text-muted-foreground text-sm">
                      {t('assistants.editor.heartbeat.loading')}
                    </p>
                  ) : null}

                  {heartbeatError ? (
                    <p role="alert" className="text-destructive text-sm">
                      {heartbeatError}
                    </p>
                  ) : null}

                  <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {t('assistants.editor.heartbeat.enableLabel')}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {t('assistants.editor.heartbeat.enableDescription')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={t('assistants.editor.heartbeat.toggleAriaLabel')}
                      aria-checked={heartbeatValues.enabled}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                        heartbeatValues.enabled
                          ? 'border-emerald-400/80 bg-emerald-500/30'
                          : 'border-border/80 bg-background/80'
                      )}
                      onClick={() => handleHeartbeatInput('enabled', !heartbeatValues.enabled)}
                      disabled={isSubmitting || isHeartbeatLoading}
                    >
                      <span
                        className={cn(
                          'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                          heartbeatValues.enabled ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="assistant-heartbeat-interval">
                      {t('assistants.editor.heartbeat.intervalLabel')}
                    </FieldLabel>
                    <Input
                      id="assistant-heartbeat-interval"
                      type="number"
                      min={1}
                      step={1}
                      value={heartbeatValues.intervalMinutes}
                      onChange={(event) =>
                        handleHeartbeatInput('intervalMinutes', event.target.value)
                      }
                      placeholder={t('assistants.editor.heartbeat.intervalPlaceholder')}
                      disabled={isSubmitting || isHeartbeatLoading}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="assistant-heartbeat-prompt">
                      {t('assistants.editor.heartbeat.promptLabel')}
                    </FieldLabel>
                    <Textarea
                      id="assistant-heartbeat-prompt"
                      rows={4}
                      value={heartbeatValues.prompt}
                      onChange={(event) => handleHeartbeatInput('prompt', event.target.value)}
                      placeholder={t('assistants.editor.heartbeat.promptPlaceholder')}
                      disabled={isSubmitting || isHeartbeatLoading}
                    />
                  </Field>
                </section>
              ) : null}
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

          {activeTab === 'skills' ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {t('assistants.editor.skills.description')}
              </p>

              {values.workspacePath.trim().length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('assistants.editor.skills.workspaceRequired')}
                </p>
              ) : null}

              {isSkillsLoading ? (
                <p className="text-muted-foreground text-sm">
                  {t('assistants.editor.skills.loading')}
                </p>
              ) : null}

              {skillsError ? (
                <p role="alert" className="text-destructive text-sm">
                  {skillsError}
                </p>
              ) : null}

              {!isSkillsLoading && values.workspacePath.trim().length > 0 && skills.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('assistants.editor.skills.empty')}
                </p>
              ) : null}

              {!isSkillsLoading
                ? skills.map((skill) => {
                    const isRemoving = removingSkillId === skill.id
                    return (
                      <article
                        key={skill.id}
                        className="rounded-xl border border-border/70 bg-card/50 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <h4 className="text-base font-medium">{skill.name}</h4>
                            {skill.description ? (
                              <p className="text-muted-foreground text-xs">{skill.description}</p>
                            ) : (
                              <p className="text-muted-foreground text-xs">
                                {t('assistants.editor.skills.noDescription')}
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs">
                              {getSkillSourceLabel(skill.source, t)} · {skill.relativePath}
                            </p>
                          </div>

                          {skill.canDelete ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={t('assistants.editor.skills.removeAriaLabel', {
                                name: skill.name
                              })}
                              disabled={isSubmitting || isRemoving || removingSkillId !== null}
                              onClick={() => void handleRemoveWorkspaceSkill(skill)}
                            >
                              {isRemoving
                                ? t('assistants.editor.skills.removingButton')
                                : t('assistants.editor.skills.removeButton')}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {t('assistants.editor.skills.readOnly')}
                            </span>
                          )}
                        </div>
                      </article>
                    )
                  })
                : null}
            </div>
          ) : null}

          {activeTab === 'coding' ? (
            <div className="space-y-4">
              {isCodexCliChecking ? (
                <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    {t('assistants.editor.coding.statusChecking')}
                  </p>
                </div>
              ) : null}

              {isCodexCliUnavailable ? (
                <div className="rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {t('assistants.editor.coding.unavailableTitle')}
                  </p>
                  <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                    {codexCliStatus?.errorMessage?.trim() ||
                      t('assistants.editor.coding.unavailableDescription')}
                  </p>
                </div>
              ) : null}

              <fieldset
                className={cn('space-y-4', isCodingControlsDisabled ? 'opacity-60' : '')}
                disabled={isCodingControlsDisabled}
              >
                <div className="rounded-xl border border-border/70 bg-card/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-base font-medium">
                        {t('assistants.editor.coding.enableLabel')}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t('assistants.editor.coding.description')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={t('assistants.editor.coding.toggleAriaLabel')}
                      aria-checked={isCodingAgentEnabled}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                        isCodingAgentEnabled
                          ? 'border-emerald-400/80 bg-emerald-500/30'
                          : 'border-border/80 bg-background/80'
                      )}
                      onClick={() => handleCodingInput('enabled', !values.coding.enabled)}
                      disabled={isCodingControlsDisabled}
                    >
                      <span
                        className={cn(
                          'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                          isCodingAgentEnabled ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>
                </div>

                <Field>
                  <FieldLabel htmlFor="assistant-coding-cwd">
                    {t('assistants.editor.coding.fields.cwd')}
                  </FieldLabel>
                  <p className="text-muted-foreground text-xs mb-2">
                    {t('assistants.editor.coding.cwdHelp')}
                  </p>
                  <Input
                    id="assistant-coding-cwd"
                    value={values.coding.cwd}
                    onChange={(event) => handleCodingInput('cwd', event.target.value)}
                    placeholder={t('assistants.editor.coding.placeholders.cwd')}
                    disabled={isCodingControlsDisabled}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="assistant-coding-add-dirs">
                    {t('assistants.editor.coding.fields.addDirs')}
                  </FieldLabel>
                  <p className="text-muted-foreground text-xs mb-2">
                    {t('assistants.editor.coding.addDirsHelp')}
                  </p>
                  <Textarea
                    id="assistant-coding-add-dirs"
                    rows={4}
                    value={values.coding.addDirs}
                    onChange={(event) => handleCodingInput('addDirs', event.target.value)}
                    placeholder={t('assistants.editor.coding.placeholders.addDirs')}
                    disabled={isCodingControlsDisabled}
                  />
                </Field>

                <article className="rounded-xl border border-border/70 bg-card/50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-base font-medium">
                        {t('assistants.editor.coding.fields.skipGitRepoCheck')}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t('assistants.editor.coding.skipGitRepoCheckHelp')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={t('assistants.editor.coding.skipGitRepoCheckAriaLabel')}
                      aria-checked={values.coding.skipGitRepoCheck}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                        values.coding.skipGitRepoCheck
                          ? 'border-emerald-400/80 bg-emerald-500/30'
                          : 'border-border/80 bg-background/80'
                      )}
                      onClick={() =>
                        handleCodingInput('skipGitRepoCheck', !values.coding.skipGitRepoCheck)
                      }
                      disabled={isCodingControlsDisabled}
                    >
                      <span
                        className={cn(
                          'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                          values.coding.skipGitRepoCheck ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>
                </article>

                <article className="rounded-xl border border-border/70 bg-card/50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-base font-medium">
                        {t('assistants.editor.coding.fields.fullAuto')}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t('assistants.editor.coding.fullAutoHelp')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={t('assistants.editor.coding.fullAutoAriaLabel')}
                      aria-checked={values.coding.fullAuto}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                        values.coding.fullAuto
                          ? 'border-emerald-400/80 bg-emerald-500/30'
                          : 'border-border/80 bg-background/80'
                      )}
                      onClick={() => handleCodingInput('fullAuto', !values.coding.fullAuto)}
                      disabled={isCodingControlsDisabled}
                    >
                      <span
                        className={cn(
                          'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                          values.coding.fullAuto ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>
                </article>

                <Field>
                  <FieldLabel htmlFor="assistant-coding-approval-mode">
                    {t('assistants.editor.coding.fields.approvalMode')}
                  </FieldLabel>
                  <p className="text-muted-foreground text-xs mb-2">
                    {t('assistants.editor.coding.approvalModeHelp')}
                  </p>
                  <select
                    id="assistant-coding-approval-mode"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={values.coding.approvalMode}
                    onChange={(event) =>
                      handleCodingInput(
                        'approvalMode',
                        event.target.value as AssistantCodingApprovalMode
                      )
                    }
                    disabled={isCodingControlsDisabled || values.coding.fullAuto}
                  >
                    {codingApprovalModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`assistants.editor.coding.approvalModes.${mode}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="assistant-coding-sandbox-mode">
                    {t('assistants.editor.coding.fields.sandboxMode')}
                  </FieldLabel>
                  <p className="text-muted-foreground text-xs mb-2">
                    {t('assistants.editor.coding.sandboxModeHelp')}
                  </p>
                  <select
                    id="assistant-coding-sandbox-mode"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={values.coding.sandboxMode}
                    onChange={(event) =>
                      handleCodingInput(
                        'sandboxMode',
                        event.target.value as AssistantCodingSandboxMode
                      )
                    }
                    disabled={isCodingControlsDisabled || values.coding.fullAuto}
                  >
                    {codingSandboxModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`assistants.editor.coding.sandboxModes.${mode}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </fieldset>
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

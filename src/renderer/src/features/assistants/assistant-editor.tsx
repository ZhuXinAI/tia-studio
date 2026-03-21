import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { SaveAssistantInput, AssistantRecord } from './assistants-query'
import { AssistantActivityPanel } from './assistant-activity-panel'
import {
  DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES,
  DEFAULT_ASSISTANT_HEARTBEAT_PROMPT,
  getAssistantHeartbeat,
  type AssistantHeartbeatRecord,
  type SaveAssistantHeartbeatInput
} from './assistant-heartbeat-query'
import type {
  ConfiguredClawChannelRecord,
  CreateClawChannelInput,
  UpdateClawChannelInput
} from '../claws/claws-query'
import { ClawChannelSelectorDialog } from '../claws/components/claw-channel-selector-dialog'
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

type AssistantEditorValues = {
  name: string
  description: string
  instructions: string
  providerId: string
  codingProviderId: string
  codingAgentEnabled: boolean
  workspacePath: string
  maxSteps: string
  mcpConfig: Record<string, boolean>
}

type AssistantHeartbeatValues = {
  enabled: boolean
  intervalMinutes: string
  prompt: string
}

export type AssistantEditorChannelsProps = {
  currentAssistantId: string | null
  channels: ConfiguredClawChannelRecord[]
  selectedChannelId: string
  isMutating: boolean
  errorMessage: string | null
  onSelectedChannelChange: (channelId: string) => void
  onCreateChannel: (
    input: CreateClawChannelInput
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onUpdateChannel: (
    channelId: string,
    input: UpdateClawChannelInput
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onDeleteChannel: (channelId: string) => Promise<void> | void
}

type AssistantEditorTab = 'essential' | 'tools' | 'skills' | 'channels' | 'activity'

type AssistantEditorProps = {
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  initialValue?: AssistantRecord | null
  isSubmitting?: boolean
  channels?: AssistantEditorChannelsProps
  showActivityTab?: boolean
  submitButtonId?: string
  onSelectWorkspacePath?: () => Promise<string | null> | string | null
  onSubmit: (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null
  ) => Promise<void> | void
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

  const codingAgentConfig =
    initialValue?.workspaceConfig?.codingAgent &&
    typeof initialValue.workspaceConfig.codingAgent === 'object' &&
    !Array.isArray(initialValue.workspaceConfig.codingAgent)
      ? (initialValue.workspaceConfig.codingAgent as Record<string, unknown>)
      : null
  const codingProviderId =
    typeof codingAgentConfig?.providerId === 'string' ? codingAgentConfig.providerId.trim() : ''
  const codingAgentEnabled =
    codingProviderId.length > 0 &&
    (codingAgentConfig?.enabled === undefined ||
      codingAgentConfig.enabled === true ||
      codingAgentConfig.enabled === 1 ||
      codingAgentConfig.enabled === 'true' ||
      codingAgentConfig.enabled === '1')

  return {
    name: initialValue?.name ?? '',
    description: initialValue?.description ?? '',
    instructions: initialValue?.instructions ?? '',
    providerId: initialValue?.providerId ?? '',
    codingProviderId,
    codingAgentEnabled,
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

  if (values.codingAgentEnabled && values.codingProviderId.trim().length === 0) {
    return t('assistants.editor.errors.codingProviderRequired')
  }

  if (values.codingAgentEnabled && values.workspacePath.trim().length === 0) {
    return t('assistants.editor.errors.codingWorkspaceRequired')
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
  channels,
  showActivityTab = false,
  submitButtonId,
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

  useEffect(() => {
    if (activeTab === 'channels' && !channels) {
      setActiveTab('essential')
      return
    }

    if (activeTab === 'activity' && (!showActivityTab || !initialValue)) {
      setActiveTab('essential')
    }
  }, [activeTab, channels, initialValue, showActivityTab])

  const title = useMemo(() => {
    return initialValue ? t('assistants.editor.editTitle') : t('assistants.editor.createTitle')
  }, [initialValue, t])

  const selectedProvider = useMemo(() => {
    return providers.find((provider) => provider.id === values.providerId) ?? null
  }, [providers, values.providerId])
  const codingProviders = useMemo(() => {
    return providers.filter(
      (provider) =>
        provider.enabled && (provider.type === 'codex-acp' || provider.type === 'claude-agent-acp')
    )
  }, [providers])
  const selectedCodingProvider = useMemo(() => {
    return codingProviders.find((provider) => provider.id === values.codingProviderId) ?? null
  }, [codingProviders, values.codingProviderId])

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
  const selectedCodingRuntimeKind = useMemo(() => {
    if (!selectedCodingProvider) {
      return null
    }

    return selectedCodingProvider.type === 'codex-acp'
      ? 'codex-acp'
      : selectedCodingProvider.type === 'claude-agent-acp'
        ? 'claude-agent-acp'
        : null
  }, [selectedCodingProvider])
  const isSelectedCodingRuntimeReady = useMemo(() => {
    if (!selectedCodingRuntimeKind || !managedRuntimeState) {
      return false
    }

    return isManagedRuntimeReady(managedRuntimeState[selectedCodingRuntimeKind])
  }, [managedRuntimeState, selectedCodingRuntimeKind])

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const validationError = validate(values, initialValue ? heartbeatValues : null, t)
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
                rootPath: workspacePath,
                ...(values.codingAgentEnabled && values.codingProviderId.trim().length > 0
                  ? {
                      codingAgent: {
                        enabled: true,
                        providerId: values.codingProviderId.trim()
                      }
                    }
                  : {})
              }
            : undefined,
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
          {channels ? (
            <button
              type="button"
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                activeTab === 'channels'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-accent/40'
              )}
              onClick={() => setActiveTab('channels')}
            >
              {t('assistants.editor.tabs.channels')}
            </button>
          ) : null}
          {showActivityTab && initialValue ? (
            <button
              type="button"
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                activeTab === 'activity'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-accent/40'
              )}
              onClick={() => setActiveTab('activity')}
            >
              {t('assistants.editor.tabs.activity')}
            </button>
          ) : null}
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
              <article className="rounded-xl border border-border/70 bg-card/50 px-4 py-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h4 className="text-base font-medium">
                      {t('assistants.editor.codingAgent.title')}
                    </h4>
                    <p className="text-muted-foreground text-sm">
                      {t('assistants.editor.codingAgent.description')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={t('assistants.editor.codingAgent.toggleAriaLabel')}
                    aria-checked={values.codingAgentEnabled}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                      values.codingAgentEnabled
                        ? 'border-emerald-400/80 bg-emerald-500/30'
                        : 'border-border/80 bg-background/80'
                    )}
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        codingAgentEnabled: !current.codingAgentEnabled,
                        codingProviderId:
                          current.codingProviderId ||
                          codingProviders.at(0)?.id ||
                          current.codingProviderId
                      }))
                    }
                    disabled={isSubmitting}
                  >
                    <span
                      className={cn(
                        'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                        values.codingAgentEnabled ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {codingProviders.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('assistants.editor.codingAgent.noProvidersPrefix')}{' '}
                    <Link className="underline underline-offset-2" to="/settings/providers">
                      {t('assistants.editor.codingAgent.providersLinkLabel')}
                    </Link>
                    . {t('assistants.editor.codingAgent.noProvidersSuffix')}
                  </p>
                ) : null}

                {values.codingAgentEnabled ? (
                  <Field>
                    <FieldLabel htmlFor="assistant-coding-provider">
                      {t('assistants.editor.codingAgent.providerLabel')}
                    </FieldLabel>
                    <select
                      id="assistant-coding-provider"
                      className="border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      value={values.codingProviderId}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          codingProviderId: event.target.value
                        }))
                      }
                      disabled={isSubmitting || codingProviders.length === 0}
                    >
                      <option value="">{t('assistants.editor.codingAgent.selectProvider')}</option>
                      {codingProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} ({provider.selectedModel})
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                {values.codingAgentEnabled && values.workspacePath.trim().length === 0 ? (
                  <p className="text-amber-500 text-sm">
                    {t('assistants.editor.codingAgent.workspaceRequired')}
                  </p>
                ) : null}

                {values.codingAgentEnabled &&
                selectedCodingProvider &&
                selectedCodingRuntimeKind &&
                !isSelectedCodingRuntimeReady ? (
                  <p className="text-amber-500 text-sm">
                    {t('assistants.editor.codingAgent.runtimeMissingPrefix')}{' '}
                    <Link className="underline underline-offset-2" to="/settings/coding">
                      {t('assistants.editor.codingAgent.codingLinkLabel')}
                    </Link>
                    .
                  </p>
                ) : null}
              </article>

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

          {activeTab === 'channels' && channels ? (
            <ClawChannelSelectorDialog
              isOpen
              layout="inline"
              currentAssistantId={channels.currentAssistantId}
              selectedChannelId={channels.selectedChannelId}
              channels={channels.channels}
              isMutating={channels.isMutating}
              errorMessage={channels.errorMessage}
              onClose={() => undefined}
              onApply={channels.onSelectedChannelChange}
              onCreateChannel={channels.onCreateChannel}
              onUpdateChannel={channels.onUpdateChannel}
              onDeleteChannel={channels.onDeleteChannel}
            />
          ) : null}

          {activeTab === 'activity' && showActivityTab && initialValue ? (
            <AssistantActivityPanel
              assistantId={initialValue.id}
              workspacePath={values.workspacePath}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button id={submitButtonId} type="submit" disabled={isSubmitting}>
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

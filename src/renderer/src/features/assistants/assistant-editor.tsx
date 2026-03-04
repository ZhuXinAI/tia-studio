import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SaveAssistantInput, AssistantRecord } from './assistants-query'
import {
  listAssistantSkills,
  removeAssistantWorkspaceSkill,
  type AssistantSkillRecord,
  type AssistantSkillSource
} from './assistant-skills-query'
import type { ProviderRecord } from '../settings/providers/providers-query'
import type { McpServerRecord } from '../settings/mcp-servers/mcp-servers-query'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { cn } from '../../lib/utils'

type AssistantEditorValues = {
  name: string
  instructions: string
  providerId: string
  workspacePath: string
  maxSteps: string
  mcpConfig: Record<string, boolean>
}

type AssistantEditorTab = 'essential' | 'tools' | 'skills'

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

  if (!parseMaxSteps(values.maxSteps)) {
    return 'Max steps must be a positive whole number'
  }

  return null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const normalized = error.message.trim()
    return normalized.length > 0 ? normalized : 'Unexpected request error'
  }

  return 'Unexpected request error'
}

function getSkillSourceLabel(source: AssistantSkillSource): string {
  if (source === 'workspace') {
    return 'Workspace'
  }

  if (source === 'global-claude') {
    return 'Global ~/.claude/skills'
  }

  return 'Global ~/.agent/skills'
}

export function AssistantEditor({
  providers,
  mcpServers,
  initialValue,
  isSubmitting,
  onSelectWorkspacePath,
  onSubmit
}: AssistantEditorProps): React.JSX.Element {
  const [values, setValues] = useState<AssistantEditorValues>(() =>
    toInitialValues(initialValue, mcpServers)
  )
  const [activeTab, setActiveTab] = useState<AssistantEditorTab>('essential')
  const [error, setError] = useState<string | null>(null)
  const [isSelectingWorkspacePath, setIsSelectingWorkspacePath] = useState(false)
  const [skills, setSkills] = useState<AssistantSkillRecord[]>([])
  const [isSkillsLoading, setIsSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState<string | null>(null)
  const [removingSkillId, setRemovingSkillId] = useState<string | null>(null)

  const title = useMemo(() => {
    return initialValue ? 'Edit Assistant' : 'Create Assistant'
  }, [initialValue])

  const mcpServerEntries = useMemo(() => {
    return Object.entries(mcpServers).sort(([left], [right]) => left.localeCompare(right))
  }, [mcpServers])

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
          setSkillsError(toErrorMessage(loadError))
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
  }, [activeTab, values.workspacePath])

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
    const validationError = validate(values)
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

    await onSubmit({
      name: values.name.trim(),
      instructions: values.instructions.trim(),
      providerId: values.providerId,
      workspaceConfig: {
        rootPath: values.workspacePath.trim()
      },
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
        selectError instanceof Error ? selectError.message : 'Unable to pick workspace folder'
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
      setSkillsError(toErrorMessage(removeError))
    } finally {
      setRemovingSkillId(null)
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
            Essential Settings
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
            Tools
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
            Skills
          </button>
        </aside>

        <div data-testid="assistant-editor-panel" className="h-[32rem] overflow-y-auto py-4 pr-1">
          {activeTab === 'essential' ? (
            <>
              <div className="my-2">
                <Label htmlFor="assistant-name">Name</Label>
                <Input
                  id="assistant-name"
                  value={values.name}
                  onChange={(event) => handleInput('name', event.target.value)}
                  placeholder="Research Copilot"
                />
              </div>

              <div className="my-2">
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
                <Label htmlFor="assistant-prompt">Prompt</Label>
                <Textarea
                  id="assistant-prompt"
                  rows={4}
                  value={values.instructions}
                  onChange={(event) => handleInput('instructions', event.target.value)}
                  placeholder="You are a helpful assistant that answers with concise, practical steps."
                />
              </div>

              <div className="my-2">
                <Label htmlFor="assistant-workspace-path">Workspace Path</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="assistant-workspace-path"
                    value={values.workspacePath}
                    onChange={(event) => handleInput('workspacePath', event.target.value)}
                    placeholder="/Users/name/workspace"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || isSelectingWorkspacePath || !onSelectWorkspacePath}
                    onClick={() => void handleSelectWorkspacePath()}
                  >
                    {isSelectingWorkspacePath ? 'Opening...' : 'Browse'}
                  </Button>
                </div>
              </div>

              <div className="my-2">
                <Label htmlFor="assistant-max-steps">Max Steps</Label>
                <Input
                  id="assistant-max-steps"
                  type="number"
                  min={1}
                  step={1}
                  value={values.maxSteps}
                  onChange={(event) => handleInput('maxSteps', event.target.value)}
                  placeholder="100"
                />
              </div>
            </>
          ) : null}

          {activeTab === 'tools' ? (
            <div className="space-y-3">
              {mcpServerEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No MCP servers configured yet. Add servers in{' '}
                  <Link className="underline underline-offset-2" to="/settings/mcp-servers">
                    MCP Server Settings
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
                              Disabled globally in MCP Server Settings.
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label={`Toggle ${serverId} for this assistant`}
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
                Skills are loaded from `~/.claude/skills`, `~/.agent/skills`, and `./skills`.
              </p>

              {values.workspacePath.trim().length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Set a workspace path first to load workspace skills.
                </p>
              ) : null}

              {isSkillsLoading ? (
                <p className="text-muted-foreground text-sm">Loading skills...</p>
              ) : null}

              {skillsError ? (
                <p role="alert" className="text-destructive text-sm">
                  {skillsError}
                </p>
              ) : null}

              {!isSkillsLoading && values.workspacePath.trim().length > 0 && skills.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No skills found in the configured global or workspace folders.
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
                                No description found in SKILL.md.
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs">
                              {getSkillSourceLabel(skill.source)} · {skill.relativePath}
                            </p>
                          </div>

                          {skill.canDelete ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Remove skill ${skill.name}`}
                              disabled={isSubmitting || isRemoving || removingSkillId !== null}
                              onClick={() => void handleRemoveWorkspaceSkill(skill)}
                            >
                              {isRemoving ? 'Removing...' : 'Remove'}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">Read-only</span>
                          )}
                        </div>
                      </article>
                    )
                  })
                : null}
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
          {isSubmitting ? 'Saving...' : initialValue ? 'Update Assistant' : 'Create Assistant'}
        </Button>
      </div>
    </form>
  )
}

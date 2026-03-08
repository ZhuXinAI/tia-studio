import { Cable, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Field, FieldLabel } from '../../../components/ui/field'
import { cn } from '../../../lib/utils'
import {
  getMcpServersSettings,
  updateMcpServersSettings,
  type McpServerRecord,
  type McpServersSettings
} from '../mcp-servers/mcp-servers-query'
import { getRequiredManagedRuntimeKind } from '../runtimes/managed-runtimes-query'

const nonEmptyString = z.string().trim().min(1)

const mcpServerSchema = z
  .object({
    isActive: z.boolean(),
    name: nonEmptyString,
    type: nonEmptyString,
    command: nonEmptyString.optional(),
    args: z.array(nonEmptyString).default([]),
    env: z.record(z.string()).default({}),
    installSource: nonEmptyString.default('unknown'),
    url: z.string().url().optional()
  })
  .superRefine((value, context) => {
    const transportType = value.type.toLowerCase()

    if (transportType === 'stdio' && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'command is required when type is stdio'
      })
    }

    if (transportType !== 'stdio' && !value.url && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'url is required for non-stdio MCP servers unless command is provided'
      })
    }
  })

const mcpServersSettingsSchema = z.object({
  mcpServers: z.record(mcpServerSchema)
})

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected request error'
}

function toUniqueServerId(existingIds: Set<string>): string {
  const baseId = 'new-mcp-server'
  if (!existingIds.has(baseId)) {
    return baseId
  }

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function parseListInput(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function formatListInput(value: string[]): string {
  return value.join('\n')
}

function parseEnvInput(value: string): Record<string, string> {
  const envEntries = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [rawKey, ...rawValueParts] = line.split('=')
      if (!rawKey) {
        return null
      }

      const key = rawKey.trim()
      const envValue = rawValueParts.join('=').trim()
      if (key.length === 0) {
        return null
      }

      return [key, envValue] as const
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)

  return Object.fromEntries(envEntries)
}

function formatEnvInput(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function createDefaultServer(serverId: string): McpServerRecord {
  return {
    isActive: true,
    name: serverId,
    type: 'stdio',
    command: 'npx',
    args: [],
    env: {},
    installSource: 'manual'
  }
}

function formatSchemaError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) {
    return 'Invalid MCP settings payload.'
  }

  const path = issue.path.length > 0 ? issue.path.join('.') : 'mcpServers'
  return `${path}: ${issue.message}`
}

function parseRawJsonInput(value: string): McpServersSettings {
  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(value) as unknown
  } catch {
    throw new Error('Raw JSON is invalid.')
  }

  const parsed = mcpServersSettingsSchema.safeParse(parsedValue)
  if (!parsed.success) {
    throw new Error(formatSchemaError(parsed.error))
  }

  return parsed.data
}

function validateSettings(
  value: McpServersSettings
): { ok: true; data: McpServersSettings } | { ok: false; message: string } {
  const parsed = mcpServersSettingsSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      message: formatSchemaError(parsed.error)
    }
  }

  return { ok: true, data: parsed.data }
}

function formatRawJsonInput(value: McpServersSettings): string {
  return JSON.stringify(value, null, 2)
}

export function McpServersSettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<McpServersSettings | null>(null)
  const [draft, setDraft] = useState<McpServersSettings | null>(null)
  const [isJsonDialogOpen, setIsJsonDialogOpen] = useState(false)
  const [jsonDialogInput, setJsonDialogInput] = useState('')
  const [jsonDialogError, setJsonDialogError] = useState<string | null>(null)
  const [envInputByServerId, setEnvInputByServerId] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)

    try {
      const nextSettings = await getMcpServersSettings()
      setSettings(nextSettings)
      setDraft(nextSettings)
      setJsonDialogInput(formatRawJsonInput(nextSettings))
      setJsonDialogError(null)
      setIsJsonDialogOpen(false)
      setEnvInputByServerId({})
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!isJsonDialogOpen) {
      setJsonDialogError(null)
    }
  }, [isJsonDialogOpen])

  const openJsonDialog = (): void => {
    setJsonDialogInput(formatRawJsonInput(draft ?? { mcpServers: {} }))
    setJsonDialogError(null)
    setIsJsonDialogOpen(true)
  }

  const closeJsonDialog = (): void => {
    setIsJsonDialogOpen(false)
    setJsonDialogError(null)
  }

  const applyJsonDialog = (): void => {
    try {
      const parsed = parseRawJsonInput(jsonDialogInput)
      setDraft(parsed)
      setEnvInputByServerId({})
      setJsonDialogError(null)
      setIsJsonDialogOpen(false)
    } catch (error) {
      setJsonDialogError(toErrorMessage(error))
    }
  }

  const serverEntries = useMemo(() => {
    if (!draft) {
      return []
    }

    return Object.entries(draft.mcpServers).sort(([left], [right]) => left.localeCompare(right))
  }, [draft])

  const isDirty = useMemo(() => {
    if (!draft) {
      return false
    }

    if (!settings) {
      return true
    }

    return JSON.stringify(settings) !== JSON.stringify(draft)
  }, [settings, draft])

  const updateServer = (
    serverId: string,
    updater: (current: McpServerRecord) => McpServerRecord
  ): void => {
    setDraft((current) => {
      if (!current) {
        return current
      }

      const server = current.mcpServers[serverId]
      if (!server) {
        return current
      }

      return {
        ...current,
        mcpServers: {
          ...current.mcpServers,
          [serverId]: updater(server)
        }
      }
    })
  }

  const addServer = (): void => {
    setDraft((current) => {
      const next = current ?? { mcpServers: {} }
      const serverId = toUniqueServerId(new Set(Object.keys(next.mcpServers)))

      return {
        ...next,
        mcpServers: {
          ...next.mcpServers,
          [serverId]: createDefaultServer(serverId)
        }
      }
    })
  }

  const removeServer = (serverId: string): void => {
    setDraft((current) => {
      if (!current || !current.mcpServers[serverId]) {
        return current
      }

      const nextServers = { ...current.mcpServers }
      delete nextServers[serverId]

      return {
        ...current,
        mcpServers: nextServers
      }
    })
    setEnvInputByServerId((current) => {
      if (!(serverId in current)) {
        return current
      }

      const nextInputs = { ...current }
      delete nextInputs[serverId]
      return nextInputs
    })
  }

  const saveSettings = async (): Promise<void> => {
    if (!draft || !isDirty) {
      return
    }

    const validation = validateSettings(draft)
    if (!validation.ok) {
      toast.error(validation.message)
      return
    }

    setIsSaving(true)

    try {
      const saved = await updateMcpServersSettings(validation.data)
      setSettings(saved)
      setDraft(saved)
      setEnvInputByServerId({})
      toast.success('MCP server settings saved.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="py-4 flex flex-col gap-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">MCP Server Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage your local <code>mcp.json</code> source-of-truth and control global MCP
              activation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={addServer}
              disabled={isLoading || isSaving}
            >
              <Plus className="size-4" />
              Add MCP Server
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openJsonDialog}
              disabled={isLoading || isSaving}
            >
              Edit JSON
            </Button>
            <Button
              type="button"
              onClick={() => void saveSettings()}
              disabled={!isDirty || isSaving || isLoading}
            >
              <Save className="size-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>MCP Servers</CardTitle>
            <CardDescription>
              These servers are shared globally and can be toggled per assistant later in the Tools
              tab.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading MCP servers...</p>
            ) : null}

            {!isLoading && serverEntries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No MCP servers yet. Add one to create your local <code>mcp.json</code> list.
              </p>
            ) : null}

            {serverEntries.map(([serverId, server]) => (
              (() => {
                const requiredRuntime = getRequiredManagedRuntimeKind(server.command)

                return (
                  <article
                    key={serverId}
                    className="space-y-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="flex items-center gap-2 text-base font-medium">
                          <Cable className="size-4" />
                          {serverId}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                          Global status controls whether assistants can use this server.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-label={`Toggle ${serverId}`}
                          aria-checked={server.isActive}
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                            server.isActive
                              ? 'border-emerald-400/80 bg-emerald-500/30'
                              : 'border-border/80 bg-background/80'
                          )}
                          onClick={() =>
                            updateServer(serverId, (current) => ({
                              ...current,
                              isActive: !current.isActive
                            }))
                          }
                          disabled={isSaving}
                        >
                          <span
                            className={cn(
                              'inline-block size-4 rounded-full bg-foreground/90 transition-transform',
                              server.isActive ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${serverId}`}
                          onClick={() => removeServer(serverId)}
                          disabled={isSaving}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {requiredRuntime ? (
                      <div className="rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                          This command can use TIA Studio managed runtimes.
                        </p>
                        <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                          Finish {requiredRuntime} setup in{' '}
                          <Link className="underline underline-offset-2" to="/settings/runtimes">
                            Runtime Setup
                          </Link>
                          .
                        </p>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`mcp-name-${serverId}`}>Display Name</FieldLabel>
                        <Input
                          id={`mcp-name-${serverId}`}
                          value={server.name}
                          onChange={(event) =>
                            updateServer(serverId, (current) => ({
                              ...current,
                              name: event.target.value
                            }))
                          }
                          placeholder="amap-maps"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`mcp-type-${serverId}`}>Transport Type</FieldLabel>
                        <Input
                          id={`mcp-type-${serverId}`}
                          value={server.type}
                          onChange={(event) =>
                            updateServer(serverId, (current) => ({
                              ...current,
                              type: event.target.value
                            }))
                          }
                          placeholder="stdio"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`mcp-command-${serverId}`}>Command</FieldLabel>
                        <Input
                          id={`mcp-command-${serverId}`}
                          value={server.command ?? ''}
                          onChange={(event) =>
                            updateServer(serverId, (current) => ({
                              ...current,
                              ...(event.target.value.trim().length > 0
                                ? { command: event.target.value }
                                : { command: undefined })
                            }))
                          }
                          placeholder="npx"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`mcp-install-source-${serverId}`}>
                          Install Source
                        </FieldLabel>
                        <Input
                          id={`mcp-install-source-${serverId}`}
                          value={server.installSource}
                          onChange={(event) =>
                            updateServer(serverId, (current) => ({
                              ...current,
                              installSource: event.target.value
                            }))
                          }
                          placeholder="unknown"
                        />
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor={`mcp-url-${serverId}`}>
                        URL (for HTTP/SSE servers)
                      </FieldLabel>
                      <Input
                        id={`mcp-url-${serverId}`}
                        value={server.url ?? ''}
                        onChange={(event) =>
                          updateServer(serverId, (current) => ({
                            ...current,
                            ...(event.target.value.trim().length > 0
                              ? { url: event.target.value }
                              : { url: undefined })
                          }))
                        }
                        placeholder="https://your-server.example.com/mcp"
                      />
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`mcp-args-${serverId}`}>
                          Arguments (one per line)
                        </FieldLabel>
                        <Textarea
                          id={`mcp-args-${serverId}`}
                          rows={4}
                          value={formatListInput(server.args)}
                          onChange={(event) =>
                            updateServer(serverId, (current) => ({
                              ...current,
                              args: parseListInput(event.target.value)
                            }))
                          }
                          placeholder={'-y\n@amap/amap-maps-mcp-server'}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`mcp-env-${serverId}`}>
                          Environment Variables (KEY=VALUE)
                        </FieldLabel>
                        <Textarea
                          id={`mcp-env-${serverId}`}
                          rows={4}
                          value={envInputByServerId[serverId] ?? formatEnvInput(server.env)}
                          onChange={(event) => {
                            const nextValue = event.target.value
                            setEnvInputByServerId((current) => ({
                              ...current,
                              [serverId]: nextValue
                            }))
                            updateServer(serverId, (current) => ({
                              ...current,
                              env: parseEnvInput(nextValue)
                            }))
                          }}
                          placeholder={'AMAP_MAPS_API_KEY=your-api-key'}
                        />
                      </Field>
                    </div>
                  </article>
                )
              })()
            ))}
          </CardContent>
        </Card>
      </div>

      {isJsonDialogOpen ? (
        <div className="bg-background/70 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-json-dialog-title"
            className="w-full max-w-4xl rounded-xl border border-border/80 bg-card shadow-2xl"
          >
            <div className="border-border/70 border-b px-5 py-4">
              <h2 id="mcp-json-dialog-title" className="text-lg font-semibold">
                Edit MCP JSON
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                This is a snapshot of your local MCP settings. Changes apply only after validation.
              </p>
            </div>
            <div className="space-y-3 p-5">
              <Field>
                <FieldLabel htmlFor="mcp-json-dialog-textarea">MCP Settings JSON</FieldLabel>
                <Textarea
                  id="mcp-json-dialog-textarea"
                  rows={16}
                  value={jsonDialogInput}
                  onChange={(event) => setJsonDialogInput(event.target.value)}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </Field>
              {jsonDialogError ? (
                <p role="alert" className="text-destructive text-xs">
                  {jsonDialogError}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  JSON parsing and MCP field rules are checked when you apply changes.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeJsonDialog}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyJsonDialog}>
                  Apply JSON
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

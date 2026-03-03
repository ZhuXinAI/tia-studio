import { Cable, ExternalLink, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { cn } from '../../../lib/utils'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'
import {
  getMcpServersSettings,
  updateMcpServersSettings,
  type McpServerRecord,
  type McpServersSettings
} from '../mcp-servers/mcp-servers-query'

type ToastState = {
  kind: 'success' | 'error'
  message: string
}

const cherryMcpInstallGuideUrl = 'https://docs.cherry-ai.com/advanced-basic/mcp/install'

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
      if (!rawKey || rawValueParts.length === 0) {
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

export function McpServersSettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<McpServersSettings | null>(null)
  const [draft, setDraft] = useState<McpServersSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setToast(null)

    try {
      const nextSettings = await getMcpServersSettings()
      setSettings(nextSettings)
      setDraft(nextSettings)
    } catch (error) {
      setToast({
        kind: 'error',
        message: toErrorMessage(error)
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

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

  const updateServer = (serverId: string, updater: (current: McpServerRecord) => McpServerRecord): void => {
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
  }

  const saveSettings = async (): Promise<void> => {
    if (!draft || !isDirty) {
      return
    }

    setIsSaving(true)
    setToast(null)

    try {
      const saved = await updateMcpServersSettings(draft)
      setSettings(saved)
      setDraft(saved)
      setToast({
        kind: 'success',
        message: 'MCP server settings saved.'
      })
    } catch (error) {
      setToast({
        kind: 'error',
        message: toErrorMessage(error)
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="grid gap-4 grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-18 self-start">
        <SettingsSidebarNav />
      </aside>

      <div className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">MCP Server Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage your local <code>mcp.json</code> source-of-truth and control global MCP activation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addServer} disabled={isLoading || isSaving}>
              <Plus className="size-4" />
              Add MCP Server
            </Button>
            <Button type="button" onClick={() => void saveSettings()} disabled={!isDirty || isSaving || isLoading}>
              <Save className="size-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </header>

        {toast ? (
          <p
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              toast.kind === 'error'
                ? 'border-destructive/70 text-destructive'
                : 'border-emerald-400/70 text-emerald-300'
            )}
          >
            {toast.message}
          </p>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Install Guidance</CardTitle>
            <CardDescription>
              Cherry-style MCP installers commonly use runtime executables like <code>uvx</code>, <code>bunx</code>, and <code>npx</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild type="button" variant="ghost" size="sm">
              <a href={cherryMcpInstallGuideUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Open Cherry MCP Install Docs
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>MCP Servers</CardTitle>
            <CardDescription>
              These servers are shared globally and can be toggled per assistant later in the Tools tab.
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
              <article key={serverId} className="space-y-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3">
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
                      onClick={() => updateServer(serverId, (current) => ({ ...current, isActive: !current.isActive }))}
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`mcp-name-${serverId}`}>Display Name</Label>
                    <Input
                      id={`mcp-name-${serverId}`}
                      value={server.name}
                      onChange={(event) =>
                        updateServer(serverId, (current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="amap-maps"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`mcp-type-${serverId}`}>Transport Type</Label>
                    <Input
                      id={`mcp-type-${serverId}`}
                      value={server.type}
                      onChange={(event) =>
                        updateServer(serverId, (current) => ({ ...current, type: event.target.value }))
                      }
                      placeholder="stdio"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`mcp-command-${serverId}`}>Command</Label>
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`mcp-install-source-${serverId}`}>Install Source</Label>
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
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`mcp-url-${serverId}`}>URL (for HTTP/SSE servers)</Label>
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
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`mcp-args-${serverId}`}>Arguments (one per line)</Label>
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`mcp-env-${serverId}`}>Environment Variables (KEY=VALUE)</Label>
                    <Textarea
                      id={`mcp-env-${serverId}`}
                      rows={4}
                      value={formatEnvInput(server.env)}
                      onChange={(event) =>
                        updateServer(serverId, (current) => ({
                          ...current,
                          env: parseEnvInput(event.target.value)
                        }))
                      }
                      placeholder={'AMAP_MAPS_API_KEY=your-api-key'}
                    />
                  </div>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

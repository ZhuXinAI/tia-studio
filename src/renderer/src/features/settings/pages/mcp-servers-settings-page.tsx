import { Braces, Cable, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { i18n } from '../../../i18n'
import { useTranslation } from '../../../i18n/use-app-translation'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Switch } from '../../../components/ui/switch'
import { Textarea } from '../../../components/ui/textarea'
import { Field, FieldLabel } from '../../../components/ui/field'
import { cn } from '../../../lib/utils'
import {
  getMcpServersSettings,
  getMcpServersHealth,
  updateMcpServersSettings,
  type McpServerHealth,
  type McpServerRecord,
  type McpServersSettings
} from '../mcp-servers/mcp-servers-query'
import { getRequiredManagedRuntimeKind } from '../runtimes/managed-runtimes-query'
import { SettingsContent } from './settings-content'

const nonEmptyString = z.string().trim().min(1)

const mcpServerSchema = z
  .object({
    isActive: z.boolean(),
    name: nonEmptyString,
    type: nonEmptyString,
    command: nonEmptyString.optional(),
    args: z.array(nonEmptyString).default([]),
    env: z.record(z.string(), z.string()).default({}),
    installSource: nonEmptyString.default('unknown'),
    url: z.string().url().optional()
  })
  .superRefine((value, context) => {
    const transportType = value.type.toLowerCase()
    if (transportType === 'stdio' && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: i18n.t('settings.mcp.validation.commandRequired')
      })
    }
    if (transportType !== 'stdio' && !value.url && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: i18n.t('settings.mcp.validation.urlRequired')
      })
    }
  })

const mcpServersSettingsSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerSchema)
})

type ServerDialogMode = 'create' | 'edit' | null

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return i18n.t('settings.mcp.validation.unexpectedError')
}

function toUniqueServerId(existingIds: Set<string>): string {
  const baseId = 'new-mcp-server'
  if (!existingIds.has(baseId)) return baseId
  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) index += 1
  return `${baseId}-${index}`
}

function parseListInput(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatListInput(value: string[]): string {
  return value.join('\n')
}

function parseEnvInput(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawKey, ...rawValueParts] = line.split('=')
        return [rawKey.trim(), rawValueParts.join('=').trim()]
      })
      .filter(([key]) => Boolean(key))
  )
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
  if (!issue) return i18n.t('settings.mcp.validation.invalidPayload')
  const path = issue.path.length > 0 ? issue.path.join('.') : 'mcpServers'
  return `${path}: ${issue.message}`
}

function parseRawJsonInput(value: string): McpServersSettings {
  let parsedValue: unknown
  try {
    parsedValue = JSON.parse(value) as unknown
  } catch {
    throw new Error(i18n.t('settings.mcp.validation.rawJsonInvalid'))
  }
  const parsed = mcpServersSettingsSchema.safeParse(parsedValue)
  if (!parsed.success) throw new Error(formatSchemaError(parsed.error))
  return parsed.data
}

function validateSettings(
  value: McpServersSettings
): { ok: true; data: McpServersSettings } | { ok: false; message: string } {
  const parsed = mcpServersSettingsSchema.safeParse(value)
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, message: formatSchemaError(parsed.error) }
}

function formatRawJsonInput(value: McpServersSettings): string {
  return JSON.stringify(value, null, 2)
}

function serverSummary(server: McpServerRecord): string {
  if (server.url) return server.url
  const command = [server.command, ...server.args].filter(Boolean).join(' ')
  return command || server.type
}

function healthStatus(
  server: McpServerRecord,
  health: McpServerHealth | undefined
): { label: string; message?: string; tone: 'active' | 'error' | 'muted' } {
  if (!server.isActive) return { label: 'Disabled', tone: 'muted' }
  if (!health) return { label: 'Waiting for a Pi thread', tone: 'muted' }
  if (health.state === 'connected') {
    return {
      label: health.toolCount === undefined ? 'Connected' : `Connected · ${health.toolCount} tools`,
      tone: 'active'
    }
  }
  if (health.state === 'unsupported') {
    return {
      label: 'Action required',
      message: 'This transport is not available in TIA yet. Use stdio or disable this server.',
      tone: 'error'
    }
  }
  return {
    label: 'Action required',
    message:
      'A connection or tool action failed. Review the command, arguments, and environment variables, then open a new thread to retry.',
    tone: 'error'
  }
}

export function McpServersSettingsPage({
  embedded = false
}: { embedded?: boolean } = {}): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<McpServersSettings | null>(null)
  const [serverHealth, setServerHealth] = useState<Record<string, McpServerHealth>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null)
  const [serverDialogMode, setServerDialogMode] = useState<ServerDialogMode>(null)
  const [activeServerId, setActiveServerId] = useState<string | null>(null)
  const [formServerId, setFormServerId] = useState('')
  const [formServer, setFormServer] = useState<McpServerRecord | null>(null)
  const [formArgs, setFormArgs] = useState('')
  const [formEnv, setFormEnv] = useState('')
  const [isJsonDialogOpen, setIsJsonDialogOpen] = useState(false)
  const [jsonDialogInput, setJsonDialogInput] = useState('')
  const [jsonDialogError, setJsonDialogError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      setSettings(await getMcpServersSettings())
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
    let isCurrent = true
    const loadHealth = async (): Promise<void> => {
      try {
        const nextHealth = await getMcpServersHealth()
        if (isCurrent) setServerHealth(nextHealth)
      } catch {
        // Health is advisory. A temporary local API failure must not hide saved MCP settings.
      }
    }
    void loadHealth()
    const intervalId = window.setInterval(() => void loadHealth(), 5_000)
    return () => {
      isCurrent = false
      window.clearInterval(intervalId)
    }
  }, [])

  const serverEntries = useMemo(
    () =>
      Object.entries(settings?.mcpServers ?? {}).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    [settings]
  )

  const closeServerDialog = (): void => {
    if (isSaving) return
    setServerDialogMode(null)
    setActiveServerId(null)
    setFormServer(null)
  }

  const openCreateDialog = (): void => {
    const serverId = toUniqueServerId(new Set(Object.keys(settings?.mcpServers ?? {})))
    const server = createDefaultServer(serverId)
    setActiveServerId(null)
    setFormServerId(serverId)
    setFormServer(server)
    setFormArgs('')
    setFormEnv('')
    setServerDialogMode('create')
  }

  const openEditDialog = (serverId: string): void => {
    const server = settings?.mcpServers[serverId]
    if (!server) return
    setActiveServerId(serverId)
    setFormServerId(serverId)
    setFormServer({ ...server, args: [...server.args], env: { ...server.env } })
    setFormArgs(formatListInput(server.args))
    setFormEnv(formatEnvInput(server.env))
    setServerDialogMode('edit')
  }

  const updateFormServer = (update: Partial<McpServerRecord>): void => {
    setFormServer((current) => (current ? { ...current, ...update } : current))
  }

  const saveServer = async (): Promise<void> => {
    if (!settings || !formServer || !serverDialogMode) return
    const serverId = serverDialogMode === 'edit' ? activeServerId : formServerId.trim()
    if (!serverId) {
      toast.error('Server ID is required')
      return
    }
    if (serverDialogMode === 'create' && settings.mcpServers[serverId]) {
      toast.error(`A server named ${serverId} already exists`)
      return
    }

    const normalizedServer: McpServerRecord = {
      ...formServer,
      name: formServer.name.trim(),
      type: formServer.type.trim(),
      installSource: formServer.installSource.trim(),
      command: formServer.command?.trim() || undefined,
      url: formServer.url?.trim() || undefined,
      args: parseListInput(formArgs),
      env: parseEnvInput(formEnv)
    }
    const nextSettings: McpServersSettings = {
      mcpServers: { ...settings.mcpServers, [serverId]: normalizedServer }
    }
    const validation = validateSettings(nextSettings)
    if (!validation.ok) {
      toast.error(validation.message)
      return
    }

    setIsSaving(true)
    try {
      setSettings(await updateMcpServersSettings(validation.data))
      toast.success(t('settings.mcp.toasts.saved'))
      setServerDialogMode(null)
      setActiveServerId(null)
      setFormServer(null)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const removeServer = async (serverId: string): Promise<void> => {
    if (!settings?.mcpServers[serverId]) return
    const nextServers = { ...settings.mcpServers }
    delete nextServers[serverId]
    setDeletingServerId(serverId)
    try {
      setSettings(await updateMcpServersSettings({ mcpServers: nextServers }))
      toast.success(t('settings.mcp.toasts.saved'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setDeletingServerId(null)
    }
  }

  const openJsonDialog = (): void => {
    setJsonDialogInput(formatRawJsonInput(settings ?? { mcpServers: {} }))
    setJsonDialogError(null)
    setIsJsonDialogOpen(true)
  }

  const saveJsonDialog = async (): Promise<void> => {
    let parsed: McpServersSettings
    try {
      parsed = parseRawJsonInput(jsonDialogInput)
      setJsonDialogError(null)
    } catch (error) {
      setJsonDialogError(toErrorMessage(error))
      return
    }

    setIsSaving(true)
    try {
      setSettings(await updateMcpServersSettings(parsed))
      setIsJsonDialogOpen(false)
      toast.success(t('settings.mcp.toasts.saved'))
    } catch (error) {
      setJsonDialogError(toErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const requiredRuntime = formServer ? getRequiredManagedRuntimeKind(formServer.command) : null

  const content = (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-12">
      <header className="flex items-end justify-between gap-6 border-b border-[color:var(--surface-border)] pb-5">
        <div className="space-y-2">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('settings.mcp.headerDescription')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={openJsonDialog} disabled={isLoading}>
            <Braces className="size-4" />
            Edit JSON
          </Button>
          <Button type="button" onClick={openCreateDialog} disabled={isLoading}>
            <Plus className="size-4" />
            {t('settings.mcp.buttons.addServer')}
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-sky-400/30 bg-sky-400/5 px-5 py-4 text-sm">
        <p className="font-semibold text-foreground">Authenticated remote MCPs</p>
        <p className="mt-1 leading-6 text-muted-foreground">
          For services such as Linear, prefer the{' '}
          <a
            className="font-medium text-foreground underline underline-offset-4"
            href="https://www.npmjs.com/package/mcp-remote"
            target="_blank"
            rel="noreferrer"
          >
            mcp-remote
          </a>{' '}
          stdio proxy: command <code>npx</code>; arguments <code>-y</code>, <code>mcp-remote</code>,
          and the server URL. It opens browser OAuth when needed. Its user-level session may be
          reused by other clients using the same mcp-remote profile and matching configuration, but
          it does not guarantee sharing a Codex or Claude login.
        </p>
        <p className="mt-2 leading-6 text-muted-foreground">
          If managed Bun is installed in Runtime Setup, TIA runs <code>npx</code> or{' '}
          <code>bunx</code> through <code>bun x</code> automatically.
        </p>
      </section>

      <section aria-labelledby="saved-mcp-servers-title" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id="saved-mcp-servers-title" className="text-sm font-semibold">
            {t('settings.mcp.savedServers')}
          </h2>
          {!isLoading ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('settings.mcp.serverCount', { count: serverEntries.length })}
            </span>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)]">
          {isLoading ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              {t('settings.mcp.loading')}
            </div>
          ) : null}

          {!isLoading && serverEntries.length === 0 ? (
            <div className="flex items-center justify-between gap-6 px-5 py-6">
              <div className="space-y-1">
                <p className="font-medium">{t('settings.mcp.emptyTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('settings.mcp.emptyDescription')}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={openCreateDialog}>
                <Plus className="size-4" />
                {t('settings.mcp.buttons.addServer')}
              </Button>
            </div>
          ) : null}

          {serverEntries.map(([serverId, server], index) => {
            const status = healthStatus(server, serverHealth[serverId])
            return (
              <article
                key={serverId}
                className={cn(
                  'group flex min-h-20 items-center gap-4 px-5 py-4 transition-colors hover:bg-[color:var(--surface-muted)]',
                  index > 0 && 'border-t border-[color:var(--surface-border)]'
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => openEditDialog(serverId)}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)]">
                    <Cable className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-semibold text-foreground">
                      {server.name || serverId}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {server.type} · {serverSummary(server)}
                    </span>
                    {status.message ? (
                      <span role="alert" className="block text-xs leading-5 text-destructive">
                        {status.message}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'mr-2 inline-flex items-center gap-1.5 text-xs',
                      status.tone === 'active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : status.tone === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        status.tone === 'active'
                          ? 'bg-emerald-500'
                          : status.tone === 'error'
                            ? 'bg-destructive'
                            : 'bg-muted-foreground/50'
                      )}
                    />
                    {status.label}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${server.name || serverId}`}
                    onClick={() => openEditDialog(serverId)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t('settings.mcp.deleteAriaLabel', { id: serverId })}
                    disabled={deletingServerId === serverId}
                    onClick={() => void removeServer(serverId)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )

  return (
    <>
      {embedded ? content : <SettingsContent size="wide">{content}</SettingsContent>}

      <Dialog
        open={serverDialogMode !== null}
        onOpenChange={(open) => !open && closeServerDialog()}
      >
        <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[color:var(--surface-border)] px-6 py-5 pr-14">
            <DialogTitle>
              {serverDialogMode === 'edit'
                ? t('settings.mcp.dialog.editTitle')
                : t('settings.mcp.dialog.addTitle')}
            </DialogTitle>
            <DialogDescription>{t('settings.mcp.dialog.description')}</DialogDescription>
          </DialogHeader>

          {formServer ? (
            <>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="flex items-center justify-between gap-5 rounded-lg border border-[color:var(--surface-border)] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{t('settings.mcp.dialog.available')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.mcp.dialog.enableDescription')}
                    </p>
                  </div>
                  <Switch
                    checked={formServer.isActive}
                    onCheckedChange={(isActive) => updateFormServer({ isActive })}
                    aria-label={t('settings.mcp.dialog.enableAriaLabel')}
                  />
                </div>

                {serverDialogMode === 'create' ? (
                  <Field>
                    <FieldLabel htmlFor="mcp-server-id">
                      {t('settings.mcp.dialog.serverId')}
                    </FieldLabel>
                    <Input
                      id="mcp-server-id"
                      value={formServerId}
                      onChange={(event) => setFormServerId(event.target.value)}
                      placeholder="my-mcp-server"
                    />
                  </Field>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t('settings.mcp.dialog.serverId')}{' '}
                    <span className="font-mono text-foreground">{activeServerId}</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mcp-display-name">
                      {t('settings.mcp.fields.displayName')}
                    </FieldLabel>
                    <Input
                      id="mcp-display-name"
                      value={formServer.name}
                      onChange={(event) => updateFormServer({ name: event.target.value })}
                      placeholder="Maps"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mcp-transport-type">
                      {t('settings.mcp.fields.transportType')}
                    </FieldLabel>
                    <Input
                      id="mcp-transport-type"
                      value={formServer.type}
                      onChange={(event) => updateFormServer({ type: event.target.value })}
                      placeholder="stdio"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mcp-command">
                      {t('settings.mcp.fields.command')}
                    </FieldLabel>
                    <Input
                      id="mcp-command"
                      value={formServer.command ?? ''}
                      onChange={(event) => updateFormServer({ command: event.target.value })}
                      placeholder="npx"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mcp-install-source">
                      {t('settings.mcp.fields.installSource')}
                    </FieldLabel>
                    <Input
                      id="mcp-install-source"
                      value={formServer.installSource}
                      onChange={(event) => updateFormServer({ installSource: event.target.value })}
                      placeholder="manual"
                    />
                  </Field>
                </div>

                {requiredRuntime ? (
                  <div className="rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                    Finish the {requiredRuntime} runtime setup before enabling this server.
                  </div>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="mcp-url">{t('settings.mcp.fields.url')}</FieldLabel>
                  <Input
                    id="mcp-url"
                    value={formServer.url ?? ''}
                    onChange={(event) => updateFormServer({ url: event.target.value })}
                    placeholder="https://your-server.example.com/mcp"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mcp-arguments">
                      {t('settings.mcp.fields.arguments')}
                    </FieldLabel>
                    <Textarea
                      id="mcp-arguments"
                      rows={5}
                      value={formArgs}
                      onChange={(event) => setFormArgs(event.target.value)}
                      placeholder={'-y\n@company/mcp-server'}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mcp-environment">
                      {t('settings.mcp.fields.environmentVariables')}
                    </FieldLabel>
                    <Textarea
                      id="mcp-environment"
                      rows={5}
                      value={formEnv}
                      onChange={(event) => setFormEnv(event.target.value)}
                      placeholder="API_KEY=your-api-key"
                    />
                  </Field>
                </div>
              </div>
              <DialogFooter className="border-t border-[color:var(--surface-border)] px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeServerDialog}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveServer()} disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save server'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isJsonDialogOpen}
        onOpenChange={(open) => !isSaving && setIsJsonDialogOpen(open)}
      >
        <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[color:var(--surface-border)] px-6 py-5 pr-14">
            <DialogTitle>{t('settings.mcp.jsonDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.mcp.jsonDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <Field>
              <FieldLabel htmlFor="mcp-json-dialog-textarea">
                {t('settings.mcp.jsonDialog.fieldLabel')}
              </FieldLabel>
              <Textarea
                id="mcp-json-dialog-textarea"
                rows={18}
                value={jsonDialogInput}
                onChange={(event) => setJsonDialogInput(event.target.value)}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </Field>
            {jsonDialogError ? (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {jsonDialogError}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('settings.mcp.jsonDialog.helper')}
              </p>
            )}
          </div>
          <DialogFooter className="border-t border-[color:var(--surface-border)] px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsJsonDialogOpen(false)}
              disabled={isSaving}
            >
              {t('settings.mcp.buttons.cancel')}
            </Button>
            <Button type="button" onClick={() => void saveJsonDialog()} disabled={isSaving}>
              {isSaving ? t('settings.mcp.buttons.saving') : t('settings.mcp.buttons.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

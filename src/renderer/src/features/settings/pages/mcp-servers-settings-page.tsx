import { useAuiState } from '@assistant-ui/react'
import { Cable } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ThreadEmpty } from '../../../components/assistant-ui/thread'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'
import { ThreadInteractionCard } from '../../threads/components/thread-interaction-card'
import { TransientPiThread } from '../../threads/components/transient-pi-thread'
import { toErrorMessage } from '../../threads/thread-page-routing'
import { useProviders } from '../providers/providers-query'
import {
  getMcpServersAuth,
  getMcpServersHealth,
  getMcpServersSettings,
  type McpServerAuthStatus,
  type McpServerHealth,
  type McpServerRecord,
  type McpServersSettings
} from '../mcp-servers/mcp-servers-query'
import { SettingsContent } from './settings-content'
import { useTranslation } from '../../../i18n/use-app-translation'

function serverSummary(server: McpServerRecord): string {
  if (server.url) return server.url
  const command = [server.command, ...server.args].filter(Boolean).join(' ')
  return command || server.type
}

function isRemoteMcpServer(server: McpServerRecord): boolean {
  const type = server.type.trim().toLowerCase()
  return type === 'http' || type === 'sse'
}

function healthStatus(
  server: McpServerRecord,
  health: McpServerHealth | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): { label: string; message?: string; tone: 'active' | 'error' | 'muted' } {
  if (!server.isActive) return { label: t('settings.mcp.health.disabled'), tone: 'muted' }
  if (!health) return { label: t('settings.mcp.health.waiting'), tone: 'muted' }
  if (health.state === 'connected') {
    return {
      label:
        health.toolCount === undefined
          ? t('settings.mcp.health.connected')
          : t('settings.mcp.health.connectedWithTools', { count: health.toolCount }),
      tone: 'active'
    }
  }
  if (health.state === 'unsupported') {
    return {
      label: t('settings.mcp.health.actionRequired'),
      message: t('settings.mcp.health.unsupported'),
      tone: 'error'
    }
  }
  return {
    label: t('settings.mcp.health.actionRequired'),
    message: t('settings.mcp.health.connectionFailed'),
    tone: 'error'
  }
}

function McpThreadEmpty(): React.JSX.Element {
  return <ThreadEmpty title="What MCP do you want to add?" />
}

function ContinueInChatAction({
  canContinue,
  isPromoting,
  onContinue
}: {
  canContinue: boolean
  isPromoting: boolean
  onContinue: () => void
}): React.JSX.Element | null {
  const isLastCompletedAssistantMessage = useAuiState(
    (state) => state.message.isLast && !state.thread.isRunning
  )
  if (!canContinue || !isLastCompletedAssistantMessage) return null
  return (
    <Button type="button" variant="outline" size="sm" disabled={isPromoting} onClick={onContinue}>
      {isPromoting ? 'Moving to Chat…' : 'Continue in Chat'}
    </Button>
  )
}

function McpSetupThread({ onMcpChanged }: { onMcpChanged: () => void }): React.JSX.Element {
  const navigate = useNavigate()
  const { data: providers = [], isLoading: providersLoading } = useProviders()
  const provider = useMemo(() => {
    const enabled = providers.filter((candidate) => candidate.enabled)
    return enabled.find((candidate) => candidate.isDefault) ?? enabled[0]
  }, [providers])

  if (providersLoading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading…</div>
    )
  }

  if (!provider) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="font-medium">Configure a model provider to add an MCP.</p>
          <Button type="button" variant="link" onClick={() => navigate('/settings/providers')}>
            Open provider settings
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TransientPiThread
      purpose="mcp-setup"
      provider={provider}
      onSessionSettled={onMcpChanged}
      getComponents={({ session, hasAssistantResponse, isPromoting, continueInChat }) => ({
        Welcome: McpThreadEmpty,
        ComposerHeader: () =>
          session?.pendingInteraction ? (
            <ThreadInteractionCard sessionId={session.id} request={session.pendingInteraction} />
          ) : null,
        AssistantActionBar: () => (
          <ContinueInChatAction
            canContinue={session?.status === 'idle' && hasAssistantResponse}
            isPromoting={isPromoting}
            onContinue={continueInChat}
          />
        )
      })}
    />
  )
}

export function McpServersSettingsPage({
  embedded = false
}: { embedded?: boolean } = {}): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<McpServersSettings | null>(null)
  const [serverHealth, setServerHealth] = useState<Record<string, McpServerHealth>>({})
  const [serverAuth, setServerAuth] = useState<Record<string, McpServerAuthStatus>>({})
  const [isLoading, setIsLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextSettings, auth] = await Promise.all([getMcpServersSettings(), getMcpServersAuth()])
      setSettings(nextSettings)
      setServerAuth(auth)
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
        // Health is advisory; it must not hide saved MCP configuration.
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

  const content = (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-12">
      <section
        aria-label="Add an MCP with TIA"
        className="h-[34rem] min-h-[28rem] overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)]"
      >
        <McpSetupThread onMcpChanged={() => void loadSettings()} />
      </section>

      <section aria-labelledby="saved-mcp-servers-title" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="saved-mcp-servers-title" className="text-sm font-semibold">
              {t('settings.mcp.savedServers')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              TIA manages these servers through the temporary setup conversation above.
            </p>
          </div>
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
            <div className="px-5 py-6">
              <p className="font-medium">No MCP servers yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell TIA what you want to connect above.
              </p>
            </div>
          ) : null}

          {serverEntries.map(([serverId, server], index) => {
            const status = healthStatus(server, serverHealth[serverId], t)
            const authentication = isRemoteMcpServer(server)
              ? (serverAuth[serverId] ?? 'not-signed-in')
              : undefined
            return (
              <article
                key={serverId}
                className={cn(
                  'flex min-h-20 items-center gap-4 px-5 py-4',
                  index > 0 && 'border-t border-[color:var(--surface-border)]'
                )}
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
                  {authentication ? (
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {t(`settings.mcp.auth.${authentication}`)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 text-xs',
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
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )

  return embedded ? content : <SettingsContent size="wide">{content}</SettingsContent>
}

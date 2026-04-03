import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Orbit,
  PanelRightOpen,
  Settings2,
  Sparkles
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/button'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import type { AssistantReadiness } from '../thread-page-helpers'
import { getThreadDisplayTitle } from '../thread-page-routing'
import type { ThreadRecord } from '../threads-query'

type ThreadSessionSidebarProps = {
  selectedAssistant: AssistantRecord | null
  selectedThread: ThreadRecord | null
  readiness: AssistantReadiness
  tokenUsage: ThreadRecord['usageTotals']
  providers: ProviderRecord[]
  onOpenNewChat: () => void
}

function countTruthyEntries(record: Record<string, unknown> | null | undefined): number {
  if (!record) {
    return 0
  }

  return Object.values(record).filter(Boolean).length
}

function readWorkspaceRootPath(assistant: AssistantRecord | null): string | null {
  const value = assistant?.workspaceConfig?.rootPath
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function resolveAssistantOriginLabel(assistant: AssistantRecord | null): string {
  if (!assistant) {
    return 'No agent selected'
  }

  if (assistant.origin === 'external-acp') {
    return 'ACP agent'
  }

  if (assistant.origin === 'built-in') {
    return 'Built-in agent'
  }

  return assistant.studioFeaturesEnabled ? 'TIA harness' : 'TIA agent'
}

function getProviderSummary(
  assistant: AssistantRecord | null,
  providers: ProviderRecord[]
): { name: string; model: string } | null {
  if (!assistant) {
    return null
  }

  const provider = providers.find((candidate) => candidate.id === assistant.providerId)
  if (!provider) {
    return null
  }

  return {
    name: provider.name,
    model: provider.selectedModel || 'Default model'
  }
}

function SessionMetric({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-3 py-3">
      <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em]">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

export function ThreadSessionSidebar({
  selectedAssistant,
  selectedThread,
  readiness,
  tokenUsage,
  providers,
  onOpenNewChat
}: ThreadSessionSidebarProps): React.JSX.Element {
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const workspaceRootPath = readWorkspaceRootPath(selectedAssistant)
  const providerSummary = useMemo(
    () => getProviderSummary(selectedAssistant, providers),
    [providers, selectedAssistant]
  )
  const threadTitle = selectedThread
    ? getThreadDisplayTitle(selectedThread.title)
    : selectedAssistant
      ? 'Draft session'
      : 'No session selected'
  const readinessLabel = readiness.canChat ? 'Ready' : 'Needs setup'
  const skillsCount = countTruthyEntries(selectedAssistant?.skillsConfig)
  const mcpCount = countTruthyEntries(selectedAssistant?.mcpConfig)
  const tokensLabel = tokenUsage ? tokenUsage.totalTokens.toLocaleString() : '0'

  return (
    <aside
      className={
        isCollapsed
          ? 'hidden min-h-0 w-[88px] flex-col border-l border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] transition-[width] duration-200 xl:flex'
          : 'hidden min-h-0 w-[320px] flex-col border-l border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] transition-[width] duration-200 xl:flex'
      }
    >
      <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
        {!isCollapsed ? (
          <div>
            <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em]">Inspector</p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">Session details</h2>
          </div>
        ) : (
          <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-[color:var(--surface-panel-soft)] text-foreground">
            <Bot className="size-4" />
          </span>
        )}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-2xl"
          onClick={() => {
            setIsCollapsed((currentState) => !currentState)
          }}
        >
          {isCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      </div>

      {isCollapsed ? (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-3 py-4">
          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] text-foreground transition-colors hover:bg-[color:var(--surface-panel)]"
            title={selectedAssistant?.name ?? 'Choose an agent'}
            onClick={() => {
              setIsCollapsed(false)
            }}
          >
            <Bot className="size-5" />
          </button>
          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] text-foreground transition-colors hover:bg-[color:var(--surface-panel)]"
            title="New chat"
            disabled={!selectedAssistant}
            onClick={onOpenNewChat}
          >
            <PanelRightOpen className="size-5" />
          </button>
          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] text-foreground transition-colors hover:bg-[color:var(--surface-panel)]"
            title="Manage in settings"
            onClick={() => {
              navigate('/settings/agents')
            }}
          >
            <Settings2 className="size-5" />
          </button>

          <div className="mt-2 flex w-full flex-col gap-2">
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-2 py-3 text-center">
              <p className="text-muted-foreground text-[9px] uppercase tracking-[0.16em]">State</p>
              <p className="mt-1 text-xs font-medium text-foreground">
                {readiness.canChat ? 'Ready' : 'Setup'}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-2 py-3 text-center">
              <p className="text-muted-foreground text-[9px] uppercase tracking-[0.16em]">
                Tokens
              </p>
              <p className="mt-1 text-xs font-medium text-foreground">{tokensLabel}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="chat-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <section className="rounded-[1.75rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-strong)] p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.7)]">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-active)] text-foreground">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em]">
                Session
              </p>
              <h2 className="mt-1 truncate text-base font-semibold text-foreground">
                {selectedAssistant?.name ?? 'Choose an agent'}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">{resolveAssistantOriginLabel(selectedAssistant)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <SessionMetric label="Status" value={readinessLabel} />
            <SessionMetric label="Thread" value={threadTitle} />
            <SessionMetric label="Tokens" value={tokensLabel} />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
          <div className="flex items-center gap-2">
            <Orbit className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Runtime</h3>
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
                Provider
              </dt>
              <dd className="mt-1 text-foreground">
                {providerSummary?.name ?? 'Connect a provider in Settings'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
                Model
              </dt>
              <dd className="mt-1 text-foreground">
                {providerSummary?.model ?? 'Default model'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
                Channel
              </dt>
              <dd className="mt-1 text-foreground">
                {selectedThread?.channelBinding?.remoteChatId
                  ? `Linked to ${selectedThread.channelBinding.remoteChatId}`
                  : 'No channel linked to this session'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
          <div className="flex items-center gap-2">
            <FolderTree className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Workspace</h3>
          </div>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {workspaceRootPath ?? 'Pick a workspace in Settings to ground files, tools, and channels.'}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <SessionMetric label="Skills" value={`${skillsCount}`} />
            <SessionMetric label="MCP" value={`${mcpCount}`} />
            <SessionMetric
              label="Studio"
              value={selectedAssistant?.studioFeaturesEnabled ? 'Enabled' : 'Secondary'}
            />
            <SessionMetric label="Vision" value={providerSummary ? 'Available' : 'Unknown'} />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Session Actions</h3>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              className="justify-start rounded-2xl"
              disabled={!selectedAssistant}
              onClick={onOpenNewChat}
            >
              <PanelRightOpen className="size-4" />
              New chat
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start rounded-2xl"
              onClick={() => {
                navigate('/settings/agents')
              }}
            >
              <Settings2 className="size-4" />
              Manage in settings
            </Button>
          </div>
        </section>
        </div>
      )}
    </aside>
  )
}

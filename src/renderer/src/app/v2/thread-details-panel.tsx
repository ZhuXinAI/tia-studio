import {
  Bot,
  Boxes,
  Cable,
  CircleDot,
  Clock3,
  Folder,
  MessageSquare,
  PanelRightClose,
  Sparkles
} from 'lucide-react'
import type { ThreadPageController } from '../../features/threads/hooks/use-thread-page-controller'
import { getThreadDisplayTitle } from '../../features/threads/thread-page-routing'
import { Button } from '../../components/ui/button'

function readProviderOverride(metadata: Record<string, unknown> | undefined): {
  providerId: string
  model: string
} | null {
  const override = metadata?.providerOverride
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return null
  }

  const overrideRecord = override as Record<string, unknown>
  const providerId = typeof overrideRecord.providerId === 'string' ? overrideRecord.providerId : ''
  const model = typeof overrideRecord.model === 'string' ? overrideRecord.model : ''
  return providerId.trim().length > 0 || model.trim().length > 0
    ? {
        providerId,
        model
      }
    : null
}

function DetailRow({
  icon: Icon,
  label,
  value,
  helper
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  helper?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color:var(--surface-muted)]">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="section-kicker text-[0.62rem]">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
          {helper ? <p className="text-xs leading-5 text-muted-foreground">{helper}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function ThreadDetailsPanel({
  controller,
  onCollapse
}: {
  controller: ThreadPageController
  onCollapse: () => void
}): React.JSX.Element {
  const selectedThread = controller.selectedThread
  const selectedWorkspace = controller.selectedWorkspace
  const providerOverride = readProviderOverride(selectedThread?.metadata)
  const selectedProvider =
    controller.providers.find((provider) => provider.id === providerOverride?.providerId) ??
    controller.providers.find((provider) => provider.id === controller.draftProviderId) ??
    null
  const modelLabel =
    providerOverride?.model.trim() ||
    controller.draftModel.trim() ||
    selectedProvider?.selectedModel ||
    'Not selected'
  const workspaceLabel = selectedWorkspace?.name ?? 'Chats'
  const channelBinding = selectedThread?.channelBinding ?? null
  const usageTotals = selectedThread?.usageTotals ?? null

  return (
    <aside className="hidden min-h-0 w-[19rem] shrink-0 flex-col border-l border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_84%,transparent),color-mix(in_srgb,var(--surface-panel)_92%,transparent))] xl:flex">
      <div className="border-b border-[color:var(--surface-border)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-kicker">Thread Details</p>
            <h2 className="font-editorial mt-1 truncate text-[1.55rem] leading-none tracking-[-0.035em]">
              {selectedThread ? getThreadDisplayTitle(selectedThread.title) : 'New Chat'}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onCollapse}
            aria-label="Collapse details"
            title="Collapse details"
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>

      <div className="chat-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <DetailRow
          icon={Folder}
          label="Workspace"
          value={workspaceLabel}
          helper={
            selectedWorkspace?.builtInKind === 'chats'
              ? 'Built-in home for ad-hoc and channel conversations.'
              : selectedWorkspace?.rootPath
          }
        />
        <DetailRow
          icon={Bot}
          label="Provider"
          value={selectedProvider?.name ?? 'Provider pending'}
          helper={`Model: ${modelLabel}`}
        />
        <DetailRow
          icon={Sparkles}
          label="Skills"
          value="Workspace default"
          helper="Capabilities are inherited from the workspace assistant and global skill catalog."
        />

        {channelBinding ? (
          <DetailRow
            icon={Cable}
            label="Channel Origin"
            value={channelBinding.channelId}
            helper={`Remote chat ${channelBinding.remoteChatId}`}
          />
        ) : (
          <DetailRow
            icon={MessageSquare}
            label="Origin"
            value="Direct chat"
            helper="Started from the TIA Studio desktop app."
          />
        )}

        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
          <div className="flex items-center gap-2">
            <CircleDot className="size-4 text-primary" />
            <p className="section-kicker text-[0.62rem]">State</p>
          </div>
          <p className="mt-2 text-sm font-medium">
            {controller.isChatStreaming ? 'Running' : selectedThread ? 'Idle' : 'Ready to start'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {controller.readiness.canChat
              ? 'The selected model is ready for this thread.'
              : 'Finish provider and model setup before sending.'}
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-muted-foreground" />
            <p className="section-kicker text-[0.62rem]">Usage</p>
          </div>
          <p className="mt-2 text-sm font-medium">
            {usageTotals ? `${usageTotals.totalTokens.toLocaleString()} tokens` : 'No usage yet'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {usageTotals
              ? `${usageTotals.inputTokens.toLocaleString()} input, ${usageTotals.outputTokens.toLocaleString()} output`
              : 'Usage appears after the first assistant response.'}
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-muted-foreground" />
            <p className="section-kicker text-[0.62rem]">Automations</p>
          </div>
          <p className="mt-2 text-sm font-medium">Manual thread</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Automation metadata will appear here when a scheduled run creates the thread.
          </p>
        </div>
      </div>
    </aside>
  )
}

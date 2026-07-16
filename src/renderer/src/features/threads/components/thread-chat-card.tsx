import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  DatabaseZap,
  Gauge,
  Link2,
  LoaderIcon,
  SendHorizontal
} from 'lucide-react'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState
} from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { listChannels, type ConfiguredChannelRecord } from '../../settings/channels/channels-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../../components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import {
  getMigrationStatus,
  runMigration,
  type MigrationStatus
} from '../../migration/migration-query'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import type { WorkspaceRecord } from '../../workspaces/workspaces-query'
import { ThreadChatMessageList } from './thread-chat-message-list'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@renderer/components/assistant-ui/attachment'
import { useAppV2ShellStatusBar } from '../../../app/v2/app-v2-shell-status'
import { deriveThreadUsageFromMessages, type ThreadUsageSummary } from '../thread-usage'
import {
  ChatCenteredContent,
  ChatComposerPanel,
  ChatMetaPill,
  ChatSurfaceFooter,
  chatSurfaceStyles
} from '../../../components/assistant-ui/chat-surface'

type ThreadChatCardProps = {
  chatLabel: string
  selectedWorkspace: WorkspaceRecord | null
  workspaces: WorkspaceRecord[]
  providers: ProviderRecord[]
  isNewThreadRoute: boolean
  draftProviderId: string
  draftModel: string
  selectedAssistant: AssistantRecord | null
  selectedThread: ThreadRecord | null
  chat: UseChatHelpers<UIMessage>
  readiness: AssistantReadiness
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  chatError: unknown
  loadError: string | null
  canAbortGeneration: boolean
  supportsVision: boolean
  tokenUsage: ThreadRecord['usageTotals']
  onSubmitMessage: (messageText: string) => Promise<void>
  onAbortGeneration: () => void
  onSelectDraftWorkspace: (workspaceId: string) => void
  onDraftProviderChange: (providerId: string) => void
  onDraftModelChange: (model: string) => void
  onRelocateWorkspace: () => void
  onDeleteWorkspace: () => void
  isRelocatingWorkspace: boolean
  isDeletingWorkspace: boolean
  headerLeadingAction?: React.ReactNode
}

function StatusBarItem({
  icon: Icon,
  label
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}): React.JSX.Element {
  return (
    <ChatMetaPill icon={Icon}>
      <span>{label}</span>
    </ChatMetaPill>
  )
}

function formatWorkingDuration(value: number): string {
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  }

  return `${seconds}s`
}

function useWorkingTimerSeconds(active: boolean): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0)
      return
    }

    const startedAt = Date.now()
    const update = (): void => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }

    update()
    const intervalId = window.setInterval(update, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [active])

  return elapsedSeconds
}

function WorkingStatusItem({ elapsedSeconds }: { elapsedSeconds: number }): React.JSX.Element {
  return (
    <ChatMetaPill className="gap-2 border-[color:var(--chat-surface-border-strong)] pr-2 text-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--surface-active)] px-2 py-1 text-primary">
        <LoaderIcon className="size-3.5 animate-spin" />
        <span>Working...</span>
      </span>
      <span className="font-medium tabular-nums text-foreground">
        {formatWorkingDuration(elapsedSeconds)}
      </span>
    </ChatMetaPill>
  )
}

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const compactValue = value / 1_000_000
    return `${compactValue % 1 === 0 ? compactValue.toFixed(0) : compactValue.toFixed(1)}M`
  }

  if (value >= 1_000) {
    const compactValue = value / 1_000
    return `${compactValue % 1 === 0 ? compactValue.toFixed(0) : compactValue.toFixed(1)}K`
  }

  return value.toString()
}

function formatContextUsagePercent(progress: number): string {
  const percent = progress * 100

  if (percent >= 100) {
    return '100%'
  }

  if (percent >= 10) {
    return `${Math.round(percent)}%`
  }

  if (percent >= 1) {
    return `${percent.toFixed(1).replace(/\.0$/, '')}%`
  }

  if (percent >= 0.1) {
    return `${percent.toFixed(1)}%`
  }

  return `${percent.toFixed(2)}%`
}

function TokenUsageStatusItem({
  usage,
  contextWindowTokens,
  label
}: {
  usage: ThreadUsageSummary
  contextWindowTokens: number | null
  label: string
}): React.JSX.Element {
  const circleRadius = 6
  const circumference = 2 * Math.PI * circleRadius
  const progress =
    contextWindowTokens && contextWindowTokens > 0
      ? Math.min(usage.totalTokens / contextWindowTokens, 1)
      : null
  const progressOffset = progress === null ? circumference : circumference * (1 - progress)
  const percentLabel =
    progress === null || contextWindowTokens === null
      ? null
      : formatContextUsagePercent(usage.totalTokens / contextWindowTokens)
  const referenceLabel =
    contextWindowTokens && contextWindowTokens > 0
      ? `${usage.totalTokens.toLocaleString()} of ${contextWindowTokens.toLocaleString()} model-context tokens used`
      : `${usage.totalTokens.toLocaleString()} tokens recorded for this thread. Add model context limits to show a true window percentage.`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ChatMetaPill className="gap-2" title={referenceLabel} aria-label={referenceLabel}>
          <span className="relative grid size-4 place-items-center" aria-hidden="true">
            <svg className="size-4 -rotate-90" viewBox="0 0 16 16" fill="none">
              <circle
                cx="8"
                cy="8"
                r={circleRadius}
                stroke="color-mix(in srgb, var(--surface-border) 78%, transparent)"
                strokeWidth="1.5"
              />
              <circle
                cx="8"
                cy="8"
                r={circleRadius}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={progress === null ? '9 4' : circumference.toString()}
                strokeDashoffset={progress === null ? '0' : progressOffset.toString()}
              />
            </svg>
          </span>
          <span>{label}</span>
        </ChatMetaPill>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-xs space-y-3 px-4 py-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-primary-foreground/70">
            Context usage
          </p>
          <p className="text-sm font-medium">
            {percentLabel ? `${percentLabel} full` : 'Context window unavailable'}
          </p>
          <p className="text-xs leading-5 text-primary-foreground/80">{referenceLabel}</p>
        </div>

        {progress !== null ? (
          <div className="h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${Math.max(progress * 100, 2)}%` }}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-primary-foreground/70">Conversation</span>
          <span className="text-right font-medium">
            {usage.totalTokens.toLocaleString()} tokens
          </span>
          <span className="text-primary-foreground/70">Assistant outputs</span>
          <span className="text-right font-medium">
            {usage.assistantMessageCount.toLocaleString()}
          </span>
          <span className="text-primary-foreground/70">Input</span>
          <span className="text-right font-medium">{usage.inputTokens.toLocaleString()}</span>
          <span className="text-primary-foreground/70">Output</span>
          <span className="text-right font-medium">{usage.outputTokens.toLocaleString()}</span>
          <span className="text-primary-foreground/70">Cached input</span>
          <span className="text-right font-medium">{usage.cachedInputTokens.toLocaleString()}</span>
          <span className="text-primary-foreground/70">Reasoning</span>
          <span className="text-right font-medium">{usage.reasoningTokens.toLocaleString()}</span>
          <span className="text-primary-foreground/70">Context limit</span>
          <span className="text-right font-medium">
            {contextWindowTokens?.toLocaleString() ?? 'Set in Provider settings'}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function normalizeModelIdentifier(value: string): string {
  const trimmedValue = value.trim().toLowerCase()
  return trimmedValue.startsWith('models/') ? trimmedValue.slice('models/'.length) : trimmedValue
}

function resolveContextWindowTokens(provider: ProviderRecord | null, model: string): number | null {
  if (!provider) {
    return null
  }

  const normalizedCurrentModel = normalizeModelIdentifier(model)
  if (normalizedCurrentModel.length === 0) {
    return null
  }

  const exactModelContextWindowTokens = provider.modelContextWindowTokensByModel
    ? provider.modelContextWindowTokensByModel[normalizedCurrentModel]
    : null
  if (
    typeof exactModelContextWindowTokens === 'number' &&
    Number.isFinite(exactModelContextWindowTokens) &&
    exactModelContextWindowTokens > 0
  ) {
    return Math.round(exactModelContextWindowTokens)
  }

  const selectedModelContextWindowTokens = provider.selectedModelContextWindowTokens
  if (
    typeof selectedModelContextWindowTokens !== 'number' ||
    !Number.isFinite(selectedModelContextWindowTokens) ||
    selectedModelContextWindowTokens <= 0
  ) {
    return null
  }

  const normalizedProviderModel = normalizeModelIdentifier(provider.selectedModel)
  if (normalizedCurrentModel.length === 0 || normalizedCurrentModel !== normalizedProviderModel) {
    return null
  }

  return Math.round(selectedModelContextWindowTokens)
}

function ComposerClearer({
  selectedAssistantId,
  selectedThreadId
}: {
  selectedAssistantId: string | undefined
  selectedThreadId: string | undefined
}): null {
  const aui = useAui()

  useEffect(() => {
    aui.composer().setText('')
  }, [aui, selectedAssistantId, selectedThreadId])

  return null
}

type ThreadChatComposerProps = Pick<
  ThreadChatCardProps,
  | 'selectedAssistant'
  | 'selectedThread'
  | 'readiness'
  | 'isChatStreaming'
  | 'canAbortGeneration'
  | 'supportsVision'
  | 'workspaces'
  | 'providers'
  | 'onSelectDraftWorkspace'
  | 'draftProviderId'
  | 'draftModel'
  | 'onDraftProviderChange'
  | 'onDraftModelChange'
  | 'onSubmitMessage'
  | 'onAbortGeneration'
> & {
  canCompose: boolean
  currentModelLabel: string
  selectedWorkspace: WorkspaceRecord | null
  isNewThreadRoute: boolean
  layout?: 'docked' | 'centered'
}

function getProviderModels(provider: ProviderRecord | null): string[] {
  if (!provider) {
    return []
  }

  const models = provider.providerModels?.length
    ? provider.providerModels
    : provider.selectedModel.trim().length > 0
      ? [provider.selectedModel]
      : []

  return [...new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))]
}

function readThreadProviderOverride(metadata: Record<string, unknown> | undefined): {
  providerId: string
  model: string
} | null {
  const override = metadata?.providerOverride
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return null
  }

  const overrideRecord = override as Record<string, unknown>
  const providerId =
    typeof overrideRecord.providerId === 'string' ? overrideRecord.providerId.trim() : ''
  const model = typeof overrideRecord.model === 'string' ? overrideRecord.model.trim() : ''
  if (providerId.length === 0 && model.length === 0) {
    return null
  }

  return {
    providerId,
    model
  }
}

function NewThreadModelPicker({
  providers,
  draftProviderId,
  draftModel,
  onDraftProviderChange,
  onDraftModelChange
}: Pick<
  ThreadChatCardProps,
  'providers' | 'draftProviderId' | 'draftModel' | 'onDraftProviderChange' | 'onDraftModelChange'
>): React.JSX.Element {
  const selectedProvider = providers.find((provider) => provider.id === draftProviderId) ?? null
  const selectedModel = draftModel.trim() || selectedProvider?.selectedModel.trim() || 'Model'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={chatSurfaceStyles.controlButton}
          disabled={providers.length === 0}
          aria-label="Select model for new chat"
          title="Select model for new chat"
        >
          <span className="truncate text-xs font-medium text-foreground">{selectedModel}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="max-h-[26rem] w-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Model for this thread
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {providers.map((provider) => {
          const models = getProviderModels(provider)
          return (
            <div key={provider.id} className="py-1">
              <DropdownMenuLabel className="px-2 py-1 text-[0.68rem] font-semibold uppercase text-muted-foreground">
                {provider.name}
              </DropdownMenuLabel>
              {models.length > 0 ? (
                models.map((model) => {
                  const isSelected = provider.id === draftProviderId && model === selectedModel
                  return (
                    <DropdownMenuItem
                      key={`${provider.id}:${model}`}
                      onSelect={() => {
                        onDraftProviderChange(provider.id)
                        onDraftModelChange(model)
                      }}
                      className="gap-2"
                    >
                      <span className="grid size-4 place-items-center">
                        {isSelected ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                    </DropdownMenuItem>
                  )
                })
              ) : (
                <p className="px-8 py-1 text-xs text-muted-foreground">No saved model</p>
              )}
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NewThreadWorkspacePicker({
  workspaces,
  selectedWorkspace,
  onSelectDraftWorkspace
}: Pick<
  ThreadChatCardProps,
  'workspaces' | 'selectedWorkspace' | 'onSelectDraftWorkspace'
>): React.JSX.Element {
  const currentLabel =
    !selectedWorkspace || selectedWorkspace.builtInKind === 'chats'
      ? "Don't do things in workspace"
      : selectedWorkspace.name
  const namedWorkspaces = workspaces
    .filter((workspace) => workspace.builtInKind !== 'chats')
    .sort((left, right) => left.name.localeCompare(right.name))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={chatSurfaceStyles.controlButton}
          aria-label="Select workspace for new chat"
          title="Select workspace for new chat"
        >
          <span className="truncate text-xs font-medium text-foreground">{currentLabel}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-[24rem] w-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspace for this thread
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSelectDraftWorkspace('')} className="gap-2">
          <span className="grid size-4 place-items-center">
            {!selectedWorkspace || selectedWorkspace.builtInKind === 'chats' ? (
              <Check className="size-3.5" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 truncate">Don't do things in workspace</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {namedWorkspaces.length > 0 ? (
          namedWorkspaces.map((workspace) => {
            const isSelected = selectedWorkspace?.id === workspace.id
            return (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={() => onSelectDraftWorkspace(workspace.id)}
                className="items-start gap-2 py-2"
              >
                <span className="grid size-4 place-items-center pt-0.5">
                  {isSelected ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{workspace.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {workspace.rootPath}
                  </span>
                </span>
              </DropdownMenuItem>
            )
          })
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No saved workspaces yet. New threads can still start in direct chat mode.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type ApprovalMode = 'ask' | 'approve' | 'full'

const approvalModeOptions: Array<{ value: ApprovalMode; label: string }> = [
  { value: 'ask', label: 'Ask for approval' },
  { value: 'approve', label: 'Approve for me' },
  { value: 'full', label: 'Full access' }
]

function ReadOnlyModelBadge({ label }: { label: string }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      className={chatSurfaceStyles.controlButtonStatic}
      aria-label={`Current model: ${label}`}
      title={`Current model: ${label}`}
    >
      <span className="truncate text-xs font-medium text-foreground">{label}</span>
    </Button>
  )
}

function ApprovalModePicker({
  value,
  onChange
}: {
  value: ApprovalMode
  onChange: (value: ApprovalMode) => void
}): React.JSX.Element {
  const selectedOption =
    approvalModeOptions.find((option) => option.value === value) ?? approvalModeOptions[2]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={chatSurfaceStyles.controlButton}
          aria-label="Select approval mode"
          title="Select approval mode"
        >
          <span className="truncate text-xs font-medium text-foreground">
            {selectedOption.label}
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Approval mode
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {approvalModeOptions.map((option) => {
          const isSelected = option.value === value

          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="gap-2"
            >
              <span className="grid size-4 place-items-center">
                {isSelected ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useChannelIssues(): ConfiguredChannelRecord[] {
  const [channelIssues, setChannelIssues] = useState<ConfiguredChannelRecord[]>([])

  useEffect(() => {
    let isActive = true

    const refresh = async (): Promise<void> => {
      try {
        const channels = await listChannels()
        if (!isActive) {
          return
        }

        setChannelIssues(
          channels.filter((channel) => channel.status === 'error' || Boolean(channel.errorMessage))
        )
      } catch {
        if (isActive) {
          setChannelIssues([])
        }
      }
    }

    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 30_000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  return channelIssues
}

function useMigrationStatus(): {
  status: MigrationStatus | null
  refresh: () => Promise<void>
} {
  const [status, setStatus] = useState<MigrationStatus | null>(null)

  useEffect(() => {
    let isActive = true

    const refresh = async (): Promise<void> => {
      try {
        const nextStatus = await getMigrationStatus()
        if (isActive) {
          setStatus(nextStatus)
        }
      } catch {
        if (isActive) {
          setStatus(null)
        }
      }
    }

    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 60_000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  return {
    status,
    refresh: async () => {
      setStatus(await getMigrationStatus())
    }
  }
}

function ThreadActionGroup({
  channelIssues,
  channelIssueTitle,
  migrationStatus,
  onOpenMigrationDialog,
  children
}: {
  channelIssues: ConfiguredChannelRecord[]
  channelIssueTitle: string
  migrationStatus: MigrationStatus | null
  onOpenMigrationDialog: () => void
  children?: React.ReactNode
}): React.JSX.Element | null {
  const shouldShowMigrationAction = migrationStatus?.needsMigration === true
  const shouldShowChannelWarning = channelIssues.length > 0
  const shouldShowChildren = Boolean(children)

  if (!shouldShowMigrationAction && !shouldShowChannelWarning && !shouldShowChildren) {
    return null
  }

  return (
    <div
      className={`${chatSurfaceStyles.panelSubtle} absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full p-1 shadow-none`}
    >
      {shouldShowChannelWarning ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-8 text-amber-700 hover:bg-amber-400/15 dark:text-amber-200"
        >
          <NavLink to="/settings/channels" aria-label={channelIssueTitle} title={channelIssueTitle}>
            <AlertTriangle className="size-4" />
          </NavLink>
        </Button>
      ) : null}
      {shouldShowMigrationAction ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-primary hover:bg-[color:var(--surface-active)]"
          onClick={onOpenMigrationDialog}
          aria-label="Migrate old app data"
          title="Migrate old app data"
        >
          <DatabaseZap className="size-4" />
        </Button>
      ) : null}
      {children}
    </div>
  )
}

function ThreadChatComposer({
  selectedAssistant,
  selectedThread,
  readiness,
  isChatStreaming,
  canAbortGeneration,
  canCompose,
  currentModelLabel,
  supportsVision,
  workspaces,
  selectedWorkspace,
  isNewThreadRoute,
  layout = 'docked',
  providers,
  onSelectDraftWorkspace,
  draftProviderId,
  draftModel,
  onDraftProviderChange,
  onDraftModelChange,
  onSubmitMessage,
  onAbortGeneration
}: ThreadChatComposerProps): React.JSX.Element {
  const { t } = useTranslation()
  const aui = useAui()
  const composerText = useAuiState((state) => (state.composer.isEditing ? state.composer.text : ''))
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('full')

  const canSendMessage =
    Boolean(selectedAssistant && readiness.canChat) &&
    composerText.trim().length > 0 &&
    !isChatStreaming &&
    canCompose

  const placeholder = selectedThread
    ? t('threads.chat.composer.placeholderSelectedThread')
    : selectedAssistant
      ? t('threads.chat.composer.placeholderSelectedAssistant')
      : t('threads.chat.composer.placeholderEmpty')

  const helperText = selectedAssistant
    ? t('threads.chat.composer.helperSelectedAssistant')
    : t('threads.chat.composer.helperEmpty')

  const modelControl = selectedThread ? (
    <ReadOnlyModelBadge label={currentModelLabel} />
  ) : (
    <NewThreadModelPicker
      providers={providers}
      draftProviderId={draftProviderId}
      draftModel={draftModel}
      onDraftProviderChange={onDraftProviderChange}
      onDraftModelChange={onDraftModelChange}
    />
  )
  const workspaceControl = !selectedThread ? (
    <NewThreadWorkspacePicker
      workspaces={workspaces}
      selectedWorkspace={selectedWorkspace}
      onSelectDraftWorkspace={onSelectDraftWorkspace}
    />
  ) : null

  if (!selectedThread && isNewThreadRoute) {
    const newThreadComposer = (
      <ComposerPrimitive.Root
        className="w-full space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const text = composerText.trim()
          if (text.length === 0) {
            return
          }

          aui.composer().setText('')
          await onSubmitMessage(text)
        }}
      >
        <ChatComposerPanel>
          <ComposerAttachments />
          <ComposerPrimitive.Input
            minRows={5}
            disabled={!canCompose || !readiness.canChat}
            placeholder="Do anything"
            aria-label={t('threads.chat.composer.ariaLabel')}
            className="placeholder:text-muted-foreground/70 flex w-full resize-none bg-transparent px-5 py-5 text-[15px] leading-7 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <ChatSurfaceFooter className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {workspaceControl}
              {selectedWorkspace?.isMissing && selectedWorkspace.builtInKind !== 'chats' ? (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-3.5" />
                  Relocate workspace
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {supportsVision ? <ComposerAddAttachment /> : null}
              <ApprovalModePicker value={approvalMode} onChange={setApprovalMode} />
              {modelControl}
              <ComposerPrimitive.Send asChild>
                <Button
                  type="submit"
                  size="icon"
                  className="size-10 rounded-full shadow-[0_12px_24px_-20px_rgba(15,23,42,0.52)]"
                  disabled={!canSendMessage}
                  aria-label={t('common.actions.send')}
                  title={t('common.actions.send')}
                >
                  <SendHorizontal className="size-4" />
                </Button>
              </ComposerPrimitive.Send>
            </div>
          </ChatSurfaceFooter>
        </ChatComposerPanel>
      </ComposerPrimitive.Root>
    )

    if (layout === 'centered') {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-10">
          <ChatCenteredContent className="flex flex-col items-center gap-6">
            <h1 className="max-w-4xl text-center text-[clamp(1.75rem,3.1vw,2.45rem)] font-medium leading-tight tracking-[-0.03em]">
              What should we build in {selectedWorkspace?.name ?? 'tia-studio'}?
            </h1>

            {!readiness.canChat && selectedAssistant ? (
              <p className="text-muted-foreground rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
                {t('threads.chat.setupIncomplete')}
              </p>
            ) : null}

            {selectedWorkspace?.isMissing && selectedWorkspace.builtInKind !== 'chats' ? (
              <div className="w-full rounded-lg border border-amber-400/45 bg-amber-400/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                Relocate this workspace before starting a new project thread.
              </div>
            ) : null}

            {newThreadComposer}
          </ChatCenteredContent>
        </div>
      )
    }

    return (
      <div className="px-5 pb-8">
        <ChatCenteredContent>{newThreadComposer}</ChatCenteredContent>
      </div>
    )
  }

  return (
    <div className="chat-section-divider p-4 sm:p-5">
      <ChatCenteredContent>
        {selectedWorkspace?.isMissing && selectedWorkspace.builtInKind !== 'chats' ? (
          <div className="mb-3 rounded-lg border border-amber-400/45 bg-amber-400/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            Relocate this workspace before starting a new project thread.
          </div>
        ) : null}
        <ComposerPrimitive.Root
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const text = composerText.trim()
            if (text.length === 0) {
              return
            }

            // Clear the composer before submitting
            aui.composer().setText('')

            await onSubmitMessage(text)
          }}
        >
          <ChatComposerPanel>
            <ComposerAttachments />

            <ComposerPrimitive.Input
              minRows={3}
              disabled={!canCompose || !readiness.canChat}
              placeholder={placeholder}
              aria-label={t('threads.chat.composer.ariaLabel')}
              className="placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full bg-transparent px-5 py-4 text-[15px] leading-7 outline-none transition-[color,box-shadow,border-color,background-color] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px]"
            />

            <ChatSurfaceFooter className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {supportsVision ? <ComposerAddAttachment /> : null}
                {!selectedThread ? <span>{helperText}</span> : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ApprovalModePicker value={approvalMode} onChange={setApprovalMode} />
                {modelControl}

                {isChatStreaming ? (
                  <Button type="button" disabled={!canAbortGeneration} onClick={onAbortGeneration}>
                    {t('common.actions.stop')}
                  </Button>
                ) : (
                  <ComposerPrimitive.Send asChild>
                    <Button
                      type="submit"
                      size="icon"
                      className="size-10 rounded-full shadow-[0_12px_24px_-20px_rgba(15,23,42,0.52)]"
                      disabled={!canSendMessage}
                      aria-label={t('common.actions.send')}
                      title={t('common.actions.send')}
                    >
                      <SendHorizontal className="size-4" />
                    </Button>
                  </ComposerPrimitive.Send>
                )}
              </div>
            </ChatSurfaceFooter>
          </ChatComposerPanel>
        </ComposerPrimitive.Root>
      </ChatCenteredContent>
    </div>
  )
}

export function ThreadChatCard({
  selectedWorkspace,
  workspaces,
  providers,
  isNewThreadRoute,
  draftProviderId,
  draftModel,
  selectedAssistant,
  selectedThread,
  chat,
  readiness,
  isLoadingChatHistory,
  isChatStreaming,
  chatError,
  loadError,
  canAbortGeneration,
  supportsVision,
  tokenUsage,
  onSubmitMessage,
  onAbortGeneration,
  onSelectDraftWorkspace,
  onDraftProviderChange,
  onDraftModelChange,
  headerLeadingAction
}: ThreadChatCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const runtime = useAISDKRuntime(chat)
  const channelIssues = useChannelIssues()
  const { status: migrationStatus, refresh: refreshMigrationStatus } = useMigrationStatus()
  const [isMigrationDialogOpen, setIsMigrationDialogOpen] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const channelIssueTitle = useMemo(() => {
    if (channelIssues.length === 0) {
      return ''
    }

    const issueNames = channelIssues
      .slice(0, 3)
      .map((channel) => channel.name)
      .join(', ')
    return channelIssues.length > 3
      ? `${issueNames}, and ${channelIssues.length - 3} more channel issues`
      : `${issueNames} needs attention`
  }, [channelIssues])
  const isBlockedByMissingWorkspace =
    !selectedThread && selectedWorkspace?.builtInKind !== 'chats' && selectedWorkspace?.isMissing

  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) &&
    !isChatStreaming &&
    !isLoadingChatHistory &&
    !isBlockedByMissingWorkspace
  const assistantName = t('threads.chat.defaultAssistantName')
  const hasRemoteBinding = Boolean(selectedThread?.channelBinding?.remoteChatId)
  const selectedThreadTitle = selectedThread?.title.trim() ?? ''
  const shouldShowThreadTitleBar = Boolean(selectedThread && selectedThreadTitle.length > 0)
  const shouldShowCenteredNewThreadState = !selectedThread && isNewThreadRoute
  const providerOverride = readThreadProviderOverride(selectedThread?.metadata)
  const selectedProvider =
    providers.find((provider) => provider.id === providerOverride?.providerId) ??
    providers.find((provider) => provider.id === selectedAssistant?.providerId) ??
    providers.find((provider) => provider.id === draftProviderId) ??
    null
  const currentModelLabel =
    providerOverride?.model ||
    (selectedThread
      ? selectedProvider?.selectedModel
      : draftModel || selectedProvider?.selectedModel) ||
    'Model pending'
  const chatMessages = Array.isArray(chat.messages) ? chat.messages : []
  const effectiveTokenUsage = useMemo(
    () => tokenUsage ?? deriveThreadUsageFromMessages(chatMessages),
    [chatMessages, tokenUsage]
  )
  const workingTimerSeconds = useWorkingTimerSeconds(isChatStreaming)
  const shellStatusContent = useMemo(() => {
    const originLabel = hasRemoteBinding ? 'Remote channel' : 'Direct chat'
    const contextWindowTokens = resolveContextWindowTokens(selectedProvider, currentModelLabel)
    const usageLabel = effectiveTokenUsage
      ? contextWindowTokens && contextWindowTokens > 0
        ? `${formatContextUsagePercent(effectiveTokenUsage.totalTokens / contextWindowTokens)} · ${formatCompactTokenCount(effectiveTokenUsage.totalTokens)} / ${formatCompactTokenCount(contextWindowTokens)} ${t('threads.chat.tokens')}`
        : `${effectiveTokenUsage.totalTokens.toLocaleString()} ${t('threads.chat.tokens')}`
      : 'No token usage yet'

    return (
      <>
        {isChatStreaming ? <WorkingStatusItem elapsedSeconds={workingTimerSeconds} /> : null}
        <StatusBarItem icon={Bot} label={currentModelLabel} />
        {effectiveTokenUsage ? (
          <TokenUsageStatusItem
            usage={effectiveTokenUsage}
            contextWindowTokens={contextWindowTokens}
            label={usageLabel}
          />
        ) : (
          <StatusBarItem icon={Gauge} label={usageLabel} />
        )}
        <StatusBarItem icon={Link2} label={originLabel} />
      </>
    )
  }, [
    currentModelLabel,
    selectedProvider,
    hasRemoteBinding,
    effectiveTokenUsage,
    isChatStreaming,
    workingTimerSeconds,
    t
  ])
  useAppV2ShellStatusBar(shellStatusContent)

  async function handleRunMigration(): Promise<void> {
    setIsMigrating(true)
    setMigrationError(null)

    try {
      await runMigration()
      await refreshMigrationStatus()
      setIsMigrationDialogOpen(false)
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : 'Migration failed')
    } finally {
      setIsMigrating(false)
    }
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer
        selectedAssistantId={selectedAssistant?.id}
        selectedThreadId={selectedThread?.id}
      />
      <Card className="relative flex min-h-0 flex-1 flex-col gap-0 rounded-none border-0 bg-transparent py-0 shadow-none">
        <ThreadActionGroup
          channelIssues={channelIssues}
          channelIssueTitle={channelIssueTitle}
          migrationStatus={migrationStatus}
          onOpenMigrationDialog={() => {
            setMigrationError(null)
            setIsMigrationDialogOpen(true)
          }}
        />
        <Dialog open={isMigrationDialogOpen} onOpenChange={setIsMigrationDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Migration required</DialogTitle>
              <DialogDescription>
                Your app contains old version data, click migrate to keep things up to date.
              </DialogDescription>
            </DialogHeader>

            {migrationStatus ? (
              <p className="text-sm text-muted-foreground">
                {migrationStatus.channelCountToRebind} channel
                {migrationStatus.channelCountToRebind === 1 ? '' : 's'} will be bound to{' '}
                {migrationStatus.defaultAssistantName}.
              </p>
            ) : null}
            {migrationError ? <p className="text-sm text-destructive">{migrationError}</p> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isMigrating}
                onClick={() => setIsMigrationDialogOpen(false)}
              >
                {t('common.actions.cancel')}
              </Button>
              <Button
                type="button"
                disabled={isMigrating}
                onClick={() => {
                  void handleRunMigration()
                }}
              >
                {isMigrating ? 'Migrating...' : 'Migrate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {shouldShowThreadTitleBar ? (
          <>
            <CardHeader className="border-b border-[color:var(--chat-surface-border)] bg-transparent px-5 pb-3 pt-2 sm:pb-4">
              <ChatCenteredContent>
                <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
                  <CardTitle className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-editorial block truncate text-[1.45rem] leading-none tracking-[-0.03em] sm:text-[1.6rem]">
                        {selectedThreadTitle}
                      </span>
                      {hasRemoteBinding ? (
                        <ChatMetaPill
                          className="shrink-0 bg-[color:var(--surface-active)] font-medium text-primary"
                          icon={Link2}
                          title={t('threads.chat.remoteBadgeTitle')}
                          aria-label={t('threads.chat.remoteBadgeTitle')}
                        >
                          {t('threads.chat.remoteBadge')}
                        </ChatMetaPill>
                      ) : null}
                    </div>
                  </CardTitle>
                  {headerLeadingAction ? (
                    <div className="shrink-0">{headerLeadingAction}</div>
                  ) : null}
                </div>
              </ChatCenteredContent>
            </CardHeader>
          </>
        ) : null}

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <CardContent
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent px-0 pb-0',
              shouldShowCenteredNewThreadState ? 'pt-0' : 'pt-6'
            )}
          >
            {shouldShowCenteredNewThreadState ? (
              <ThreadChatComposer
                selectedWorkspace={selectedWorkspace}
                selectedAssistant={selectedAssistant}
                selectedThread={selectedThread}
                readiness={readiness}
                isChatStreaming={isChatStreaming}
                canAbortGeneration={canAbortGeneration}
                canCompose={canCompose}
                currentModelLabel={currentModelLabel}
                supportsVision={supportsVision}
                workspaces={workspaces}
                isNewThreadRoute={isNewThreadRoute}
                layout="centered"
                providers={providers}
                onSelectDraftWorkspace={onSelectDraftWorkspace}
                draftProviderId={draftProviderId}
                draftModel={draftModel}
                onDraftProviderChange={onDraftProviderChange}
                onDraftModelChange={onDraftModelChange}
                onSubmitMessage={onSubmitMessage}
                onAbortGeneration={onAbortGeneration}
              />
            ) : (
              <>
                {!readiness.canChat && selectedAssistant ? (
                  <ChatCenteredContent className="mb-4 px-5">
                    <p className="text-muted-foreground rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
                      {t('threads.chat.setupIncomplete')}
                    </p>
                  </ChatCenteredContent>
                ) : null}

                {selectedThread ? (
                  <ThreadChatMessageList
                    key={selectedThread.id}
                    threadId={selectedThread.id}
                    assistantName={assistantName}
                    isLoadingChatHistory={isLoadingChatHistory}
                    isChatStreaming={isChatStreaming}
                    loadError={loadError}
                    chatError={chatError}
                  />
                ) : null}
              </>
            )}
          </CardContent>

          {shouldShowCenteredNewThreadState ? null : (
            <ThreadChatComposer
              selectedWorkspace={selectedWorkspace}
              selectedAssistant={selectedAssistant}
              selectedThread={selectedThread}
              readiness={readiness}
              isChatStreaming={isChatStreaming}
              canAbortGeneration={canAbortGeneration}
              canCompose={canCompose}
              currentModelLabel={currentModelLabel}
              supportsVision={supportsVision}
              workspaces={workspaces}
              isNewThreadRoute={isNewThreadRoute}
              providers={providers}
              onSelectDraftWorkspace={onSelectDraftWorkspace}
              draftProviderId={draftProviderId}
              draftModel={draftModel}
              onDraftProviderChange={onDraftProviderChange}
              onDraftModelChange={onDraftModelChange}
              onSubmitMessage={onSubmitMessage}
              onAbortGeneration={onAbortGeneration}
            />
          )}
        </ThreadPrimitive.Root>
      </Card>
    </AssistantRuntimeProvider>
  )
}

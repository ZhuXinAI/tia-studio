import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  type DataMessagePartProps,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useMessagePartFile
} from '@assistant-ui/react'
import { Virtuoso, type IndexLocationWithAlign } from 'react-virtuoso'
import { Copy, File, LoaderIcon, MoreHorizontal, RotateCw } from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import { toErrorMessage } from '../thread-page-routing'
import { Reasoning, ReasoningGroup } from '../../../components/assistant-ui/reasoning'
import { MarkdownText } from '../../../components/assistant-ui/markdown-text'
import { ToolFallback } from '../../../components/assistant-ui/tool-fallback'
import { ToolGroup } from '../../../components/assistant-ui/tool-group'
import { Button } from '../../../components/ui/button'
import { Image } from '@renderer/components/assistant-ui/image'
import { UserMessageAttachments } from '@renderer/components/assistant-ui/attachment'
import { useTranslation } from '../../../i18n/use-app-translation'

type ThreadChatMessageListProps = {
  threadId: string | null
  assistantName: string
  assistantMessageVariant?: 'default' | 'team'
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  loadError: string | null
  chatError: unknown
}

const AssistantNameContext = createContext('Assistant')
const ESTIMATED_MESSAGE_HEIGHT = 160
const TEAM_ERROR_MESSAGE_MAX_LENGTH = 50

type TeamMemberToolResult = {
  kind: 'team-member-result'
  assistantId: string
  assistantName: string
  task: string
  text: string
  mentions: string[]
  mentionNames: string[]
  subAgentThreadId: string | null
  subAgentResourceId: string | null
}

type ToolAgentStreamData = {
  text?: string
  status?: 'running' | 'finished'
  toolCalls?: unknown[]
  toolResults?: unknown[]
}

type AssistantMessagePart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'reasoning'
      text: string
    }
  | {
      type: 'tool-call'
      toolName: string
      toolCallId: string
      result?: unknown
      status?: {
        type?: string
        reason?: string
        error?: unknown
      }
    }
  | {
      type: 'data'
      name: string
      data: unknown
    }
  | {
      type: string
      [key: string]: unknown
    }

type TeamNestedToolCall = {
  key: string
  name: string
  status: 'running' | 'complete' | 'error'
}

type TeamVisibleMessageBlock = {
  key: string
  assistantName: string
  text: string
  mentions: string[]
  status: 'running' | 'complete' | 'error'
  nestedTools: TeamNestedToolCall[]
}

type MessageUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}

function isTeamMemberToolResult(value: unknown): value is TeamMemberToolResult {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<TeamMemberToolResult>
  return (
    candidate.kind === 'team-member-result' &&
    typeof candidate.assistantName === 'string' &&
    typeof candidate.text === 'string' &&
    Array.isArray(candidate.mentionNames)
  )
}

function isDelegationToolPart(
  part: AssistantMessagePart
): part is Extract<AssistantMessagePart, { type: 'tool-call' }> {
  return (
    part.type === 'tool-call' &&
    typeof part.toolName === 'string' &&
    part.toolName.startsWith('delegate_to_')
  )
}

function isCompletionToolPart(
  part: AssistantMessagePart
): part is Extract<AssistantMessagePart, { type: 'tool-call' }> {
  return part.type === 'tool-call' && part.toolName === 'complete'
}

function isToolAgentDataPart(part: AssistantMessagePart): part is Extract<
  AssistantMessagePart,
  { type: 'data'; name: string; data: unknown }
> & {
  name: 'tool-agent'
  data: ToolAgentStreamData
} {
  return part.type === 'data' && part.name === 'tool-agent'
}

function formatLabelFromToken(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDelegatedAssistantName(toolName: string): string {
  const match = /^delegate_to_(.+?)_(\d+)$/.exec(toolName)
  const rawName = match?.[1] ?? toolName
  return formatLabelFromToken(rawName)
}

function extractToolCallPayload(entry: unknown): { toolCallId: string; toolName: string } | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const payload =
    'payload' in entry && entry.payload && typeof entry.payload === 'object'
      ? (entry.payload as Record<string, unknown>)
      : (entry as Record<string, unknown>)
  const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
  const toolName = typeof payload.toolName === 'string' ? payload.toolName : null

  if (!toolCallId || !toolName) {
    return null
  }

  return {
    toolCallId,
    toolName
  }
}

function extractToolResultStatus(
  entry: unknown
): { toolCallId: string; status: 'complete' | 'error' } | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const payload =
    'payload' in entry && entry.payload && typeof entry.payload === 'object'
      ? (entry.payload as Record<string, unknown>)
      : (entry as Record<string, unknown>)
  const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
  if (!toolCallId) {
    return null
  }

  return {
    toolCallId,
    status: payload.isError === true ? 'error' : 'complete'
  }
}

function extractNestedTools(snapshot: ToolAgentStreamData | null): TeamNestedToolCall[] {
  if (!snapshot) {
    return []
  }

  const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : []
  const toolResults = Array.isArray(snapshot.toolResults) ? snapshot.toolResults : []
  const statuses = new Map<string, 'complete' | 'error'>()

  for (const result of toolResults) {
    const parsed = extractToolResultStatus(result)
    if (parsed) {
      statuses.set(parsed.toolCallId, parsed.status)
    }
  }

  return toolCalls
    .map((call) => extractToolCallPayload(call))
    .filter((call): call is { toolCallId: string; toolName: string } => call !== null)
    .map((call) => ({
      key: call.toolCallId,
      name: formatLabelFromToken(call.toolName),
      status: statuses.get(call.toolCallId) ?? 'running'
    }))
}

function normalizeErrorMessage(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function truncateErrorMessage(value: string): string {
  if (value.length <= TEAM_ERROR_MESSAGE_MAX_LENGTH) {
    return value
  }

  return `${value.slice(0, TEAM_ERROR_MESSAGE_MAX_LENGTH - 3)}...`
}

function extractTeamToolErrorMessage(
  status: Extract<AssistantMessagePart, { type: 'tool-call' }>['status']
): string | null {
  if (status?.type !== 'incomplete') {
    return null
  }

  if (typeof status.error === 'string') {
    const normalized = normalizeErrorMessage(status.error)
    return normalized ? truncateErrorMessage(normalized) : null
  }

  if (
    status.error &&
    typeof status.error === 'object' &&
    'message' in status.error &&
    typeof (status.error as { message?: unknown }).message === 'string'
  ) {
    const normalized = normalizeErrorMessage((status.error as { message: string }).message)
    return normalized ? truncateErrorMessage(normalized) : null
  }

  return null
}

function buildTeamVisibleBlocks(parts: readonly AssistantMessagePart[]): TeamVisibleMessageBlock[] {
  const delegationTools = parts.filter(isDelegationToolPart)
  const agentDataParts = parts.filter(isToolAgentDataPart)
  const blocks = delegationTools.map((toolPart) => ({
    toolPart,
    result: isTeamMemberToolResult(toolPart.result) ? toolPart.result : null,
    snapshot: null as ToolAgentStreamData | null
  }))

  const unresolvedBlockIndices = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.result === null && block.toolPart.status?.type !== 'complete')
    .map(({ index }) => index)

  const unresolvedSnapshotStart =
    unresolvedBlockIndices.length > 0
      ? Math.max(0, agentDataParts.length - unresolvedBlockIndices.length)
      : agentDataParts.length

  let unresolvedSnapshotIndex = unresolvedSnapshotStart
  for (const blockIndex of unresolvedBlockIndices) {
    blocks[blockIndex]!.snapshot = agentDataParts[unresolvedSnapshotIndex]?.data ?? null
    unresolvedSnapshotIndex += 1
  }

  let leftoverSnapshotIndex = 0
  for (const block of blocks) {
    if (leftoverSnapshotIndex >= unresolvedSnapshotStart) {
      break
    }

    if (block.snapshot) {
      continue
    }

    block.snapshot = agentDataParts[leftoverSnapshotIndex]?.data ?? null
    leftoverSnapshotIndex += 1
  }

  return blocks
    .map(({ toolPart, result, snapshot }) => {
      const errorMessage = extractTeamToolErrorMessage(toolPart.status)
      const text =
        errorMessage ??
        result?.text.trim() ??
        (typeof snapshot?.text === 'string' ? snapshot.text.trim() : '')
      const nestedTools = extractNestedTools(snapshot)
      const status: 'running' | 'complete' | 'error' = errorMessage
        ? 'error'
        : result || snapshot?.status === 'finished' || toolPart.status?.type === 'complete'
          ? 'complete'
          : 'running'

      if (!text && nestedTools.length === 0 && status !== 'running') {
        return null
      }

      return {
        key: toolPart.toolCallId,
        assistantName: result?.assistantName ?? formatDelegatedAssistantName(toolPart.toolName),
        text,
        mentions: result?.mentionNames ?? [],
        status,
        nestedTools
      } satisfies TeamVisibleMessageBlock
    })
    .filter((block): block is TeamVisibleMessageBlock => block !== null)
}

function formatMessageTimestamp(
  value: Date | string | null | undefined,
  locale: string | undefined
): string | null {
  if (!value) {
    return null
  }

  const parsedDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsedDate.valueOf())) {
    return null
  }

  return parsedDate.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function normalizeInteger(value: unknown): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : 0

  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.max(0, Math.round(numericValue))
}

function extractMessageUsage(metadata: unknown): MessageUsage | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const usage = (metadata as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null
  }

  const parsedUsage = {
    inputTokens: normalizeInteger((usage as Record<string, unknown>).inputTokens),
    outputTokens: normalizeInteger((usage as Record<string, unknown>).outputTokens),
    totalTokens: normalizeInteger((usage as Record<string, unknown>).totalTokens),
    reasoningTokens: normalizeInteger((usage as Record<string, unknown>).reasoningTokens),
    cachedInputTokens: normalizeInteger((usage as Record<string, unknown>).cachedInputTokens)
  }

  if (
    parsedUsage.inputTokens === 0 &&
    parsedUsage.outputTokens === 0 &&
    parsedUsage.totalTokens === 0 &&
    parsedUsage.reasoningTokens === 0 &&
    parsedUsage.cachedInputTokens === 0
  ) {
    return null
  }

  return parsedUsage
}

function MessageTimestamp({ className }: { className?: string }): React.JSX.Element | null {
  const { i18n } = useTranslation()
  const createdAt = useAuiState((state) => state.message.createdAt)
  const timestampLabel = formatMessageTimestamp(createdAt, i18n.resolvedLanguage)

  if (!timestampLabel) {
    return null
  }

  return (
    <p
      data-testid="message-timestamp"
      className={
        className
          ? `text-muted-foreground text-[11px] ${className}`
          : `text-muted-foreground text-[11px]`
      }
    >
      {timestampLabel}
    </p>
  )
}

function MessageUsageDetails({
  align = 'left'
}: {
  align?: 'left' | 'right'
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const isHovering = useAuiState((state) => state.message.isHovering)
  const metadata = useAuiState(
    (state) => (state.message as { metadata?: unknown }).metadata ?? null
  )
  const usage = extractMessageUsage(metadata)

  if (!isHovering || !usage) {
    return null
  }

  const usageSegments = [
    `${usage.totalTokens.toLocaleString(i18n.resolvedLanguage)} ${t('threads.chat.tokens')}`,
    t('threads.chat.tokenInput', {
      value: usage.inputTokens.toLocaleString(i18n.resolvedLanguage)
    }),
    t('threads.chat.tokenOutput', {
      value: usage.outputTokens.toLocaleString(i18n.resolvedLanguage)
    })
  ]

  if (usage.reasoningTokens > 0) {
    usageSegments.push(`${usage.reasoningTokens.toLocaleString(i18n.resolvedLanguage)} reasoning`)
  }

  if (usage.cachedInputTokens > 0) {
    usageSegments.push(`${usage.cachedInputTokens.toLocaleString(i18n.resolvedLanguage)} cached`)
  }

  return (
    <p
      data-testid="message-usage"
      className={
        align === 'right'
          ? 'text-muted-foreground text-[11px] text-right'
          : 'text-muted-foreground text-[11px]'
      }
    >
      {usageSegments.join(' • ')}
    </p>
  )
}

function UserTextPart(): React.JSX.Element {
  return <MessagePartPrimitive.Text className="text-sm leading-relaxed whitespace-pre-wrap" />
}

function UserFileAttachment(): React.JSX.Element {
  const { t } = useTranslation()
  const file = useMessagePartFile()

  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
      <File className="size-4 text-muted-foreground" />
      <span className="text-sm">{file.filename || t('threads.messageList.untitledFile')}</span>
      {file.mimeType && <span className="text-muted-foreground text-xs">({file.mimeType})</span>}
    </div>
  )
}

function UserMessageBubble(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <MessagePrimitive.Root className="ml-auto max-w-2xl px-4 py-3">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        {t('threads.messageList.you')}
      </p>

      <UserMessageAttachments />

      <MessagePrimitive.Parts
        components={{
          Text: UserTextPart,
          Image: Image,
          File: UserFileAttachment
        }}
      />
      <div className="mt-2 space-y-2">
        <MessageTimestamp className="text-right" />
        <MessageUsageDetails align="right" />
      </div>
    </MessagePrimitive.Root>
  )
}

const assistantPartsComponents = {
  Reasoning: Reasoning,
  ReasoningGroup: ReasoningGroup,
  Text: MarkdownText,
  data: {
    by_name: {
      'tool-agent': ToolAgentStreamPart
    }
  },
  tools: {
    Fallback: ToolFallback
  },
  ToolGroup: ToolGroup
} as const

function ToolAgentStreamPart({
  data
}: DataMessagePartProps<ToolAgentStreamData>): React.JSX.Element | null {
  const text = typeof data?.text === 'string' ? data.text.trim() : ''

  if (!text || data?.status === 'finished') {
    return null
  }

  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/25 px-4 py-3">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        Delegated stream
      </p>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
    </div>
  )
}

function AssistantMessageHeader({ assistantName }: { assistantName: string }): React.JSX.Element {
  return (
    <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
      {assistantName}
    </p>
  )
}

function AssistantMessageActions(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <MessageTimestamp />

        <ActionBarPrimitive.Root autohide="never" className="ml-auto flex items-center gap-1">
          <ActionBarPrimitive.Copy asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('threads.messageList.copyMessage')}
            >
              <Copy className="size-3.5" />
            </Button>
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('threads.messageList.reloadMessage')}
            >
              <RotateCw className="size-3.5" />
            </Button>
          </ActionBarPrimitive.Reload>

          <ActionBarMorePrimitive.Root>
            <ActionBarMorePrimitive.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('threads.messageList.moreActions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </ActionBarMorePrimitive.Trigger>

            <ActionBarMorePrimitive.Content className="bg-card text-card-foreground border-border z-50 min-w-44 rounded-md border p-1 shadow-lg">
              <ActionBarPrimitive.ExportMarkdown asChild>
                <ActionBarMorePrimitive.Item className="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50">
                  {t('threads.messageList.exportMarkdown')}
                </ActionBarMorePrimitive.Item>
              </ActionBarPrimitive.ExportMarkdown>
            </ActionBarMorePrimitive.Content>
          </ActionBarMorePrimitive.Root>
        </ActionBarPrimitive.Root>
      </div>
      <MessageUsageDetails />
    </div>
  )
}

function StandardAssistantMessageBubble(): React.JSX.Element {
  const assistantName = useContext(AssistantNameContext)

  return (
    <MessagePrimitive.Root className="max-w-3xl px-4 py-3">
      <AssistantMessageHeader assistantName={assistantName} />
      <MessagePrimitive.Parts components={assistantPartsComponents} />
      <AssistantMessageActions />
    </MessagePrimitive.Root>
  )
}

function TeamVisibleMessageCard({ block }: { block: TeamVisibleMessageBlock }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          {block.assistantName}
        </p>
        {block.status === 'running' ? (
          <LoaderIcon className="text-muted-foreground size-3.5 animate-spin" />
        ) : null}
      </div>

      {block.text ? (
        <div
          className={
            block.status === 'error'
              ? 'text-destructive whitespace-pre-wrap text-sm leading-relaxed'
              : 'whitespace-pre-wrap text-sm leading-relaxed'
          }
        >
          {block.text}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Working...</p>
      )}

      {block.mentions.length > 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Suggested next: {block.mentions.join(', ')}
        </p>
      ) : null}

      {block.nestedTools.length > 0 ? (
        <div className="mt-3 border-t border-dashed pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
            Tools
          </p>
          <div className="space-y-2">
            {block.nestedTools.map((tool) => (
              <div
                key={tool.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <span>{tool.name}</span>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  {tool.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TeamAssistantMessageBubble(): React.JSX.Element | null {
  const assistantName = useContext(AssistantNameContext)
  const parts = useAuiState(
    (state) => state.message.parts as unknown as readonly AssistantMessagePart[]
  )
  const visibleBlocks = useMemo(() => buildTeamVisibleBlocks(parts), [parts])
  const hidesSupervisorMessage = useMemo(
    () => visibleBlocks.length === 0 && parts.some(isCompletionToolPart),
    [parts, visibleBlocks.length]
  )

  if (hidesSupervisorMessage) {
    return null
  }

  if (visibleBlocks.length === 0) {
    return <StandardAssistantMessageBubble />
  }

  return (
    <MessagePrimitive.Root className="max-w-3xl px-4 py-3">
      <div className="space-y-4">
        {visibleBlocks.map((block) => (
          <TeamVisibleMessageCard key={block.key} block={block} />
        ))}
      </div>

      <div className="sr-only">{assistantName}</div>
      <AssistantMessageActions />
    </MessagePrimitive.Root>
  )
}

function ThreadChatStatus({
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: Pick<
  ThreadChatMessageListProps,
  'isLoadingChatHistory' | 'isChatStreaming' | 'loadError' | 'chatError'
>): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      {isLoadingChatHistory ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('threads.messageList.loadingHistory')}
        </p>
      ) : null}

      {isChatStreaming ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('threads.messageList.responding')}
        </p>
      ) : null}

      {chatError ? (
        <p role="alert" className="text-destructive text-sm">
          {toErrorMessage(chatError)}
        </p>
      ) : null}

      {loadError ? (
        <p
          role="alert"
          className="text-destructive rounded-md border border-destructive/60 px-3 py-2 text-sm"
        >
          {loadError}
        </p>
      ) : null}
    </>
  )
}

export function ThreadChatMessageList({
  threadId,
  assistantName,
  assistantMessageVariant = 'default',
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: ThreadChatMessageListProps): React.JSX.Element {
  const { t } = useTranslation()
  const messages = useAuiState((state) => state.thread.messages)
  const messageCount = messages.length
  const hasMessages = messageCount > 0
  const shouldRenderVirtualList = hasMessages || !isLoadingChatHistory
  const renderState = hasMessages ? 'data' : 'empty'
  const initialTopMostItemIndex = useMemo<IndexLocationWithAlign>(
    () => ({
      index: 'LAST',
      align: 'end'
    }),
    []
  )
  const initialTopMostItemProps = hasMessages ? { initialTopMostItemIndex } : {}
  const messageComponents = useMemo(
    () => ({
      UserMessage: UserMessageBubble,
      AssistantMessage:
        assistantMessageVariant === 'team'
          ? TeamAssistantMessageBubble
          : StandardAssistantMessageBubble
    }),
    [assistantMessageVariant]
  )

  if (!shouldRenderVirtualList) {
    return (
      <AssistantNameContext.Provider value={assistantName}>
        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          <ThreadChatStatus
            isLoadingChatHistory={isLoadingChatHistory}
            isChatStreaming={isChatStreaming}
            loadError={loadError}
            chatError={chatError}
          />
        </div>
      </AssistantNameContext.Provider>
    )
  }

  function EmptyPlaceholder(): React.JSX.Element {
    return <p className="text-muted-foreground text-sm">{t('threads.messageList.empty')}</p>
  }

  function Footer(): React.JSX.Element {
    return (
      <div className="space-y-3 pt-3">
        <ThreadChatStatus
          isLoadingChatHistory={isLoadingChatHistory}
          isChatStreaming={isChatStreaming}
          loadError={loadError}
          chatError={chatError}
        />
      </div>
    )
  }

  return (
    <AssistantNameContext.Provider value={assistantName}>
      <Virtuoso
        key={`${threadId ?? 'thread'}:${renderState}`}
        className="chat-scrollbar min-h-0 flex-1 pr-1"
        style={{ height: '100%', overflowAnchor: 'none' }}
        data={messages}
        defaultItemHeight={ESTIMATED_MESSAGE_HEIGHT}
        alignToBottom
        atBottomThreshold={24}
        followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
        increaseViewportBy={{ top: 0, bottom: 240 }}
        minOverscanItemCount={{ top: 4, bottom: 8 }}
        {...initialTopMostItemProps}
        computeItemKey={(index, message) => message.id ?? `${threadId ?? 'thread'}:${index}`}
        components={{
          EmptyPlaceholder,
          Footer
        }}
        itemContent={(index) => (
          <div className="flex pb-3">
            <ThreadPrimitive.MessageByIndex index={index} components={messageComponents} />
          </div>
        )}
      />
    </AssistantNameContext.Provider>
  )
}

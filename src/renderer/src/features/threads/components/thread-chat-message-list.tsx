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
import { ChevronDownIcon, Copy, File, LoaderIcon, MoreHorizontal, RotateCw } from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import { toErrorMessage } from '../thread-page-routing'
import { Reasoning, ReasoningGroup } from '../../../components/assistant-ui/reasoning'
import { MarkdownText } from '../../../components/assistant-ui/markdown-text'
import { ToolFallback } from '../../../components/assistant-ui/tool-fallback'
import { ToolGroup } from '../../../components/assistant-ui/tool-group'
import { Button } from '../../../components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../../components/ui/collapsible'
import { Image } from '@renderer/components/assistant-ui/image'
import { UserMessageAttachments } from '@renderer/components/assistant-ui/attachment'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import { extractThreadMessageUsage } from '../thread-usage'
import {
  ChatCenteredContent,
  chatSurfaceStyles
} from '../../../components/assistant-ui/chat-surface'

type ThreadChatMessageListProps = {
  threadId: string | null
  assistantName: string
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  loadError: string | null
  chatError: unknown
}

const AssistantNameContext = createContext('Assistant')
const ESTIMATED_MESSAGE_HEIGHT = 160
const DELEGATION_ERROR_MESSAGE_MAX_LENGTH = 50
const ACTIVITY_SUMMARY_MAX_LENGTH = 96

type DelegatedAgentToolResult = {
  kind: 'delegated-agent-result'
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
      type: 'step-start'
    }
  | {
      type: string
      [key: string]: unknown
    }

type DelegatedNestedToolCall = {
  key: string
  name: string
  status: 'running' | 'complete' | 'error'
}

type DelegatedVisibleMessageBlock = {
  key: string
  assistantName: string
  text: string
  mentions: string[]
  status: 'running' | 'complete' | 'error'
  nestedTools: DelegatedNestedToolCall[]
}

function isDelegatedAgentToolResult(value: unknown): value is DelegatedAgentToolResult {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<DelegatedAgentToolResult>
  return (
    candidate.kind === 'delegated-agent-result' &&
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

function isStandardToolPart(
  part: AssistantMessagePart
): part is Extract<AssistantMessagePart, { type: 'tool-call' }> {
  return part.type === 'tool-call' && !isDelegationToolPart(part) && !isCompletionToolPart(part)
}

function isStepStartPart(
  part: AssistantMessagePart
): part is Extract<AssistantMessagePart, { type: 'step-start' }> {
  return part.type === 'step-start'
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

function isInvisibleMetadataDataPart(
  part: AssistantMessagePart
): part is Extract<AssistantMessagePart, { type: 'data'; name: string; data: unknown }> {
  return part.type === 'data' && part.name !== 'tool-agent'
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

function extractNestedTools(snapshot: ToolAgentStreamData | null): DelegatedNestedToolCall[] {
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
  if (value.length <= DELEGATION_ERROR_MESSAGE_MAX_LENGTH) {
    return value
  }

  return `${value.slice(0, DELEGATION_ERROR_MESSAGE_MAX_LENGTH - 3)}...`
}

function normalizeActivityLine(value: string): string | null {
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/^[>\-*\d.)\s]+/, '')
    .trim()

  return normalized.length > 0 ? normalized : null
}

function truncateActivitySummary(value: string): string {
  if (value.length <= ACTIVITY_SUMMARY_MAX_LENGTH) {
    return value
  }

  return `${value.slice(0, ACTIVITY_SUMMARY_MAX_LENGTH - 3)}...`
}

function extractLatestActionSummary(value: string): string | null {
  const lines = value.split(/\r?\n/)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const normalizedLine = normalizeActivityLine(lines[index] ?? '')
    if (normalizedLine) {
      return truncateActivitySummary(normalizedLine)
    }
  }

  return null
}

function getLatestNestedToolName(nestedTools: readonly DelegatedNestedToolCall[]): string | null {
  for (let index = nestedTools.length - 1; index >= 0; index -= 1) {
    const tool = nestedTools[index]
    if (tool?.status === 'running') {
      return tool.name
    }
  }

  return nestedTools[nestedTools.length - 1]?.name ?? null
}

function summarizeDelegatedVisibleBlock(block: DelegatedVisibleMessageBlock): {
  actionCount: number | null
  summary: string
} {
  const textSummary = extractLatestActionSummary(block.text)
  const nestedToolSummary = getLatestNestedToolName(block.nestedTools)

  return {
    actionCount: block.nestedTools.length > 0 ? block.nestedTools.length : null,
    summary:
      textSummary ??
      nestedToolSummary ??
      (block.status === 'error' ? 'Delegated task failed' : 'Working...')
  }
}

function extractDelegationToolErrorMessage(
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

function buildDelegatedVisibleBlocks(
  parts: readonly AssistantMessagePart[]
): DelegatedVisibleMessageBlock[] {
  const delegationTools = parts.filter(isDelegationToolPart)
  const agentDataParts = parts.filter(isToolAgentDataPart)
  const blocks = delegationTools.map((toolPart) => ({
    toolPart,
    result: isDelegatedAgentToolResult(toolPart.result) ? toolPart.result : null,
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
      const errorMessage = extractDelegationToolErrorMessage(toolPart.status)
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
      } satisfies DelegatedVisibleMessageBlock
    })
    .filter((block): block is DelegatedVisibleMessageBlock => block !== null)
}

type CompletedMessagePartGroup = {
  groupKey: string | undefined
  indices: number[]
}

function findNextNonStepStartIndex(
  parts: readonly AssistantMessagePart[],
  startIndex: number
): number | null {
  for (let index = startIndex; index < parts.length; index += 1) {
    if (!isStepStartPart(parts[index]!)) {
      return index
    }
  }

  return null
}

export function groupCompletedAssistantMessageParts(
  parts: readonly AssistantMessagePart[]
): CompletedMessagePartGroup[] {
  const groups: CompletedMessagePartGroup[] = []

  for (let index = 0; index < parts.length; ) {
    const part = parts[index]!

    if (isStepStartPart(part) || isInvisibleMetadataDataPart(part)) {
      index += 1
      continue
    }

    if (part.type === 'reasoning') {
      const indices = [index]
      let cursor = index + 1
      while (cursor < parts.length && parts[cursor]?.type === 'reasoning') {
        indices.push(cursor)
        cursor += 1
      }

      groups.push({
        groupKey: `reasoning:${indices[0]}`,
        indices
      })
      index = cursor
      continue
    }

    if (isStandardToolPart(part)) {
      const indices = [index]
      let cursor = index + 1
      let lastToolIndex = index

      while (cursor < parts.length) {
        const candidate = parts[cursor]!

        if (isStandardToolPart(candidate)) {
          indices.push(cursor)
          lastToolIndex = cursor
          cursor += 1
          continue
        }

        if (isStepStartPart(candidate)) {
          const nextIndex = findNextNonStepStartIndex(parts, cursor + 1)
          if (nextIndex === null || !isStandardToolPart(parts[nextIndex]!)) {
            break
          }

          indices.push(nextIndex)
          lastToolIndex = nextIndex
          cursor = nextIndex + 1
          continue
        }

        if (isInvisibleMetadataDataPart(candidate)) {
          cursor += 1
          continue
        }

        break
      }

      groups.push({
        groupKey: `tool:${indices[0]}`,
        indices
      })
      index = lastToolIndex + 1
      continue
    }

    groups.push({
      groupKey: undefined,
      indices: [index]
    })
    index += 1
  }

  return groups
}

function isAssistantActivityGroup(
  parts: readonly AssistantMessagePart[],
  group: CompletedMessagePartGroup
): boolean {
  return group.indices.every((index) => {
    const part = parts[index]
    return part?.type === 'reasoning' || (part ? isStandardToolPart(part) : false)
  })
}

function groupAssistantActivityParts(
  parts: readonly AssistantMessagePart[]
): CompletedMessagePartGroup[] {
  return groupCompletedAssistantMessageParts(parts).filter((group) =>
    isAssistantActivityGroup(parts, group)
  )
}

function isVisibleAssistantBodyPart(part: AssistantMessagePart): boolean {
  if (isStepStartPart(part) || isInvisibleMetadataDataPart(part) || isToolAgentDataPart(part)) {
    return false
  }

  if (
    part.type === 'reasoning' ||
    isStandardToolPart(part) ||
    isDelegationToolPart(part) ||
    isCompletionToolPart(part)
  ) {
    return false
  }

  return true
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
      className={cn(chatSurfaceStyles.metaPill, 'w-fit leading-none', className)}
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
  const usage = extractThreadMessageUsage(metadata)

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
      className={cn(
        chatSurfaceStyles.metaPill,
        'w-fit leading-none',
        align === 'right' && 'ml-auto text-right'
      )}
    >
      {usageSegments.join(' • ')}
    </p>
  )
}

function UserTextPart(): React.JSX.Element {
  return (
    <MessagePartPrimitive.Text className="text-sm leading-7 whitespace-pre-wrap text-foreground" />
  )
}

function UserFileAttachment(): React.JSX.Element {
  const { t } = useTranslation()
  const file = useMessagePartFile()

  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-xl border border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg-subtle)] px-3 py-2">
      <File className="size-4 text-muted-foreground" />
      <span className="text-sm">{file.filename || t('threads.messageList.untitledFile')}</span>
      {file.mimeType && <span className="text-muted-foreground text-xs">({file.mimeType})</span>}
    </div>
  )
}

function UserMessageBubble(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <MessagePrimitive.Root className="ml-auto w-full max-w-[40rem] px-4 py-3">
      <div className="flex flex-col items-end gap-2">
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.18em]">
          {t('threads.messageList.you')}
        </p>

        <div className="w-full rounded-[26px] border border-[color:var(--chat-surface-border)] bg-[color:var(--chat-user-bubble)] px-4 py-3 shadow-[0_12px_26px_-24px_rgba(15,23,42,0.28)]">
          <UserMessageAttachments />

          <MessagePrimitive.Parts
            components={{
              Text: UserTextPart,
              Image: Image,
              File: UserFileAttachment
            }}
          />
        </div>

        <div className="space-y-2">
          <MessageTimestamp className="ml-auto text-right" />
          <MessageUsageDetails align="right" />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function CompletedAssistantMessageGroup({
  children,
  indices
}: {
  children?: React.ReactNode
  indices: number[]
}): React.JSX.Element {
  const parts = useAuiState(
    (state) => state.message.parts as unknown as readonly AssistantMessagePart[]
  )
  const firstIndex = indices[0]
  const lastIndex = indices[indices.length - 1]
  const groupParts = indices
    .map((index) => parts[index])
    .filter((part): part is AssistantMessagePart => part !== undefined)

  if (groupParts.length > 0 && groupParts.every((part) => part.type === 'reasoning')) {
    return (
      <ReasoningGroup endIndex={lastIndex} startIndex={firstIndex}>
        {children}
      </ReasoningGroup>
    )
  }

  if (groupParts.length > 0 && groupParts.every((part) => isStandardToolPart(part))) {
    return (
      <ToolGroup endIndex={lastIndex} indices={indices} startIndex={firstIndex}>
        {children}
      </ToolGroup>
    )
  }

  return <>{children}</>
}

const completedAssistantPartsComponents = {
  Reasoning: Reasoning,
  Text: MarkdownText,
  data: {
    by_name: {
      'tool-agent': ToolAgentStreamPart
    }
  },
  tools: {
    Fallback: ToolFallback
  },
  Group: CompletedAssistantMessageGroup
} as const

const assistantTextOnlyComponents = {
  Text: MarkdownText,
  Image: Image,
  data: {
    by_name: {
      'tool-agent': () => null
    }
  },
  tools: {
    Fallback: () => null
  },
  Reasoning: () => null
} as const

function ToolAgentStreamPart({
  data
}: DataMessagePartProps<ToolAgentStreamData>): React.JSX.Element | null {
  const text = typeof data?.text === 'string' ? data.text.trim() : ''

  if (!text || data?.status === 'finished') {
    return null
  }

  return (
    <div className={`${chatSurfaceStyles.panelSubtle} mb-3 rounded-[22px] px-4 py-3`}>
      <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-[0.18em]">
        Delegated stream
      </p>
      <div className="whitespace-pre-wrap text-sm leading-7">{text}</div>
    </div>
  )
}

function AssistantMessageActions({
  withSeparator = true
}: {
  withSeparator?: boolean
} = {}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'mt-4 space-y-2',
        withSeparator && 'border-t border-[color:var(--chat-surface-border)] pt-3'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ActionBarPrimitive.Root
          autohide="never"
          className="flex items-center gap-1 rounded-full bg-[color:var(--chat-surface-bg-subtle)] p-1 shadow-none"
        >
          <ActionBarPrimitive.Copy asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 rounded-full hover:text-foreground"
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
              className="text-muted-foreground size-7 rounded-full hover:text-foreground"
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
                className="text-muted-foreground size-7 rounded-full hover:text-foreground"
                aria-label={t('threads.messageList.moreActions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </ActionBarMorePrimitive.Trigger>

            <ActionBarMorePrimitive.Content className="z-50 min-w-44 rounded-xl border border-[color:var(--chat-surface-border-strong)] bg-[color:var(--chat-surface-bg-elevated)] p-1.5 text-card-foreground shadow-[0_20px_45px_-30px_rgba(15,23,42,0.48)]">
              <ActionBarPrimitive.ExportMarkdown asChild>
                <ActionBarMorePrimitive.Item className="flex cursor-default select-none items-center rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:opacity-50 data-[highlighted]:bg-[color:var(--surface-muted)] data-[highlighted]:text-foreground">
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
  const parts = useAuiState(
    (state) => state.message.parts as unknown as readonly AssistantMessagePart[]
  )
  const shouldRenderGroupedActivities = parts.some(
    (part) => isStandardToolPart(part) || part.type === 'reasoning'
  )
  const hasVisibleBody = parts.some(isVisibleAssistantBodyPart)
  const shouldRenderBodyCard = hasVisibleBody || !shouldRenderGroupedActivities

  return (
    <MessagePrimitive.Root className="w-full px-4 py-3">
      <div className="space-y-3">
        {shouldRenderGroupedActivities ? (
          <MessagePrimitive.Unstable_PartsGrouped
            components={completedAssistantPartsComponents}
            groupingFunction={groupAssistantActivityParts}
          />
        ) : null}

        {shouldRenderBodyCard ? (
          <div
            className={`${chatSurfaceStyles.panelElevated} w-full space-y-3 rounded-[28px] px-4 py-4 text-[14px]`}
          >
            <MessagePrimitive.Parts components={assistantTextOnlyComponents} />
            <AssistantMessageActions />
          </div>
        ) : shouldRenderGroupedActivities ? (
          <AssistantMessageActions withSeparator={false} />
        ) : null}
      </div>
    </MessagePrimitive.Root>
  )
}

function DelegatedVisibleMessageCard({
  block
}: {
  block: DelegatedVisibleMessageBlock
}): React.JSX.Element {
  const { actionCount, summary } = summarizeDelegatedVisibleBlock(block)

  return (
    <Collapsible defaultOpen={false} className={`${chatSurfaceStyles.panelSubtle} rounded-[24px]`}>
      <CollapsibleTrigger
        data-slot="delegated-activity-trigger"
        className="group/delegated-trigger flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        {actionCount ? (
          <span className="inline-flex min-w-9 items-center justify-center rounded-xl border border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg)] px-2 py-1 text-sm font-medium tabular-nums text-foreground">
            {actionCount}
          </span>
        ) : (
          <span
            className={cn(
              'mt-2 size-2 shrink-0 rounded-full',
              block.status === 'running'
                ? 'bg-blue-500/80'
                : block.status === 'error'
                  ? 'bg-red-500/80'
                  : 'bg-emerald-500/70'
            )}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.18em]">
              {block.assistantName}
            </p>
            {block.status === 'running' ? (
              <LoaderIcon className="text-muted-foreground size-3.5 animate-spin" />
            ) : null}
          </div>
          <p
            className={cn(
              'truncate text-sm leading-6 text-foreground',
              block.status === 'error' && 'text-destructive'
            )}
          >
            {summary}
          </p>
        </div>

        <ChevronDownIcon className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/delegated-trigger:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent
        data-slot="delegated-activity-content"
        className={cn(
          'overflow-hidden px-4 pb-4 text-sm outline-none ease-out',
          'data-[state=closed]:animate-collapsible-up',
          'data-[state=open]:animate-collapsible-down',
          'data-[state=closed]:fill-mode-forwards',
          'data-[state=closed]:pointer-events-none',
          'data-[state=open]:duration-200',
          'data-[state=closed]:duration-200'
        )}
      >
        <div className="border-t border-[color:var(--chat-surface-border)] pt-4">
          {block.text ? (
            <div
              className={
                block.status === 'error'
                  ? 'text-destructive whitespace-pre-wrap text-sm leading-7'
                  : 'whitespace-pre-wrap text-sm leading-7'
              }
            >
              {block.text}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Working...</p>
          )}

          {block.mentions.length > 0 ? (
            <p className={`${chatSurfaceStyles.metaPill} mt-4 inline-flex text-xs`}>
              Suggested next: {block.mentions.join(', ')}
            </p>
          ) : null}

          {block.nestedTools.length > 0 ? (
            <div className={`${chatSurfaceStyles.panelSubtle} mt-4 rounded-[20px] p-3`}>
              <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-[0.18em]">
                Tools
              </p>
              <div className="space-y-2">
                {block.nestedTools.map((tool) => (
                  <div
                    key={tool.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg)] px-3 py-2 text-sm"
                  >
                    <span>{tool.name}</span>
                    <span className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                      {tool.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DelegationAwareAssistantMessageBubble(): React.JSX.Element | null {
  const assistantName = useContext(AssistantNameContext)
  const parts = useAuiState(
    (state) => state.message.parts as unknown as readonly AssistantMessagePart[]
  )
  const visibleBlocks = useMemo(() => buildDelegatedVisibleBlocks(parts), [parts])
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
    <MessagePrimitive.Root className="w-full px-4 py-3">
      <div
        className={`${chatSurfaceStyles.panelElevated} w-full space-y-4 rounded-[28px] px-4 py-4 text-[14px]`}
      >
        {visibleBlocks.map((block) => (
          <DelegatedVisibleMessageCard key={block.key} block={block} />
        ))}

        <div className="sr-only">{assistantName}</div>
        <AssistantMessageActions />
      </div>
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
      AssistantMessage: DelegationAwareAssistantMessageBubble
    }),
    []
  )

  if (!shouldRenderVirtualList) {
    return (
      <AssistantNameContext.Provider value={assistantName}>
        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          <ChatCenteredContent className="px-5">
            <ThreadChatStatus
              isLoadingChatHistory={isLoadingChatHistory}
              isChatStreaming={isChatStreaming}
              loadError={loadError}
              chatError={chatError}
            />
          </ChatCenteredContent>
        </div>
      </AssistantNameContext.Provider>
    )
  }

  function EmptyPlaceholder(): React.JSX.Element {
    return (
      <ChatCenteredContent className="px-5">
        <p className="text-muted-foreground text-sm">{t('threads.messageList.empty')}</p>
      </ChatCenteredContent>
    )
  }

  function Footer(): React.JSX.Element {
    return (
      <ChatCenteredContent className="px-5">
        <div className="space-y-3 pt-4">
          <ThreadChatStatus
            isLoadingChatHistory={isLoadingChatHistory}
            isChatStreaming={isChatStreaming}
            loadError={loadError}
            chatError={chatError}
          />
        </div>
      </ChatCenteredContent>
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
          <ChatCenteredContent className="flex w-full px-5 pb-4">
            <ThreadPrimitive.MessageByIndex index={index} components={messageComponents} />
          </ChatCenteredContent>
        )}
      />
    </AssistantNameContext.Provider>
  )
}

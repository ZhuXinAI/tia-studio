import type {
  AgentAttachment,
  AppAgentMessage,
  AgentMessagePart
} from '../../../../../shared/agent-runtime'

export type OptimisticUserMessage = {
  message: AppAgentMessage
  fingerprint: string
}

export type AppendMessageContent = {
  text: string
  attachments: AgentAttachment[]
}

function createLocalMessageId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.()
  return `optimistic-${randomUUID ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function normalizeAttachment(attachment: {
  id: string
  name: string
  mimeType: string
  data: string
}): string[] {
  return [attachment.id, attachment.name, attachment.mimeType, attachment.data]
}

export function appendMessageFingerprint(content: AppendMessageContent): string {
  return JSON.stringify([
    content.text.trim(),
    content.attachments.map((attachment) => normalizeAttachment(attachment))
  ])
}

export function agentMessageFingerprint(message: AppAgentMessage): string | null {
  if (message.role !== 'user') return null

  const text = message.parts
    .filter((part): part is Extract<AgentMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
  const attachments = message.parts
    .filter((part): part is Extract<AgentMessagePart, { type: 'image' }> => part.type === 'image')
    .map((part) =>
      normalizeAttachment({
        id: part.attachmentId,
        name: part.name,
        mimeType: part.mimeType,
        data: part.data
      })
    )

  return JSON.stringify([text.trim(), attachments])
}

export function createOptimisticUserMessage(
  sessionId: string,
  content: AppendMessageContent,
  now = new Date()
): OptimisticUserMessage {
  const text = content.text.trim()
  const message: AppAgentMessage = {
    id: createLocalMessageId(),
    sessionId,
    role: 'user',
    parts: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...content.attachments.map((attachment) => ({
        type: 'image' as const,
        attachmentId: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        data: attachment.data
      }))
    ],
    createdAt: now.toISOString(),
    status: 'complete'
  }

  return {
    message,
    fingerprint: appendMessageFingerprint(content)
  }
}

function isCanonicalMatch(canonical: AppAgentMessage, optimistic: OptimisticUserMessage): boolean {
  if (canonical.id === optimistic.message.id || canonical.role !== 'user') return false
  if (agentMessageFingerprint(canonical) !== optimistic.fingerprint) return false

  const canonicalTime = new Date(canonical.createdAt).getTime()
  const optimisticTime = new Date(optimistic.message.createdAt).getTime()
  return !Number.isFinite(canonicalTime) || !Number.isFinite(optimisticTime)
    ? true
    : canonicalTime >= optimisticTime
}

export function settleOptimisticUserMessage(
  messages: AppAgentMessage[],
  pending: OptimisticUserMessage[],
  canonical: AppAgentMessage
): { messages: AppAgentMessage[]; pending: OptimisticUserMessage[] } {
  const match = pending.find((item) => isCanonicalMatch(canonical, item))
  if (!match) return { messages, pending }

  return {
    messages: messages.filter((message) => message.id !== match.message.id),
    pending: pending.filter((item) => item.message.id !== match.message.id)
  }
}

export function reconcileOptimisticUserMessages(
  messages: AppAgentMessage[],
  pending: OptimisticUserMessage[]
): { messages: AppAgentMessage[]; pending: OptimisticUserMessage[] } {
  let nextMessages = messages
  let nextPending = pending
  for (const message of messages) {
    const settled = settleOptimisticUserMessage(nextMessages, nextPending, message)
    nextMessages = settled.messages
    nextPending = settled.pending
  }
  return { messages: nextMessages, pending: nextPending }
}

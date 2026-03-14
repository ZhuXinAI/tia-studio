import type { UIMessage } from 'ai'

export function buildThreadCompactionTranscript(messages: UIMessage[]): string {
  return messages
    .map((message, index) => {
      const speaker = message.role === 'assistant' ? 'Assistant' : 'User'
      return `### ${index + 1}. ${speaker}\n${extractCompactionMessageText(message)}`
    })
    .join('\n\n')
    .trim()
}

export function extractCompactionMessageText(message: UIMessage): string {
  const textParts = message.parts
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return null
      }

      const record = part as Record<string, unknown>
      if (record.type === 'text') {
        return toNonEmptyString(record.text)
      }

      if (record.type === 'image') {
        return '[Image attachment omitted]'
      }

      if (record.type === 'file') {
        return '[File attachment omitted]'
      }

      return null
    })
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (textParts.length > 0) {
    return textParts.join('\n')
  }

  const fallbackContent = toNonEmptyString((message as { content?: unknown }).content)
  return fallbackContent ?? '[Non-text content omitted]'
}

export function buildThreadHistoryDocument(input: {
  assistantName: string
  providerName: string
  modelName: string
  threadTitle: string
  compactedAt: string
  summary: string
  transcript: string
}): string {
  const transcriptBody =
    input.transcript.trim().length > 0 ? input.transcript : '(No persisted transcript was available.)'

  return [
    '# Thread History',
    '',
    `- Thread: ${input.threadTitle}`,
    `- Compacted at: ${input.compactedAt}`,
    `- Assistant: ${input.assistantName}`,
    `- Summary provider: ${input.providerName} / ${input.modelName}`,
    '',
    '## Summary',
    '',
    input.summary.trim(),
    '',
    '## Transcript Snapshot',
    '',
    transcriptBody,
    ''
  ].join('\n')
}

export function formatDateToken(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()
  return normalizedValue.length > 0 ? normalizedValue : null
}

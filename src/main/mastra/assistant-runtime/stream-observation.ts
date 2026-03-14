import type { UIMessageChunk } from 'ai'

export type ThreadUsageMetrics = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}

export type StreamUsageObservation = {
  assistantMessageId: string | null
  totalUsage: ThreadUsageMetrics | null
  rawUsage: unknown
  stepCount: number
  finishReason: string | null
  createdAt: string | null
}

export async function collectStreamText(stream: ReadableStream<UIMessageChunk>): Promise<{
  text: string
  observation: StreamUsageObservation
}> {
  const reader = stream.getReader()
  const responseTextParts: string[] = []
  const observation = createStreamUsageObservation()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      const observedValue = observeStreamChunk(observation, value)

      if (observedValue.type === 'text-delta' && typeof observedValue.delta === 'string') {
        responseTextParts.push(observedValue.delta)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return {
    text: responseTextParts.join(''),
    observation
  }
}

export function createStreamUsageObservation(): StreamUsageObservation {
  return {
    assistantMessageId: null,
    totalUsage: null,
    rawUsage: null,
    stepCount: 0,
    finishReason: null,
    createdAt: null
  }
}

export function observeStreamChunk(
  observation: StreamUsageObservation,
  chunk: UIMessageChunk
): UIMessageChunk {
  const chunkRecord = chunk as Record<string, unknown>

  if (chunkRecord.type === 'start') {
    const messageId =
      typeof chunkRecord.messageId === 'string' && chunkRecord.messageId.trim().length > 0
        ? chunkRecord.messageId
        : null
    if (messageId) {
      observation.assistantMessageId = messageId
    }

    const createdAt = normalizeTimestamp(chunkRecord.createdAt)
    if (createdAt) {
      observation.createdAt = createdAt
    }

    return chunk
  }

  if (chunkRecord.type === 'finish-step') {
    observation.stepCount += 1
    return chunk
  }

  if (chunkRecord.type !== 'finish') {
    return chunk
  }

  const messageId =
    typeof chunkRecord.messageId === 'string' && chunkRecord.messageId.trim().length > 0
      ? chunkRecord.messageId
      : null
  if (messageId) {
    observation.assistantMessageId ??= messageId
  }

  const createdAt = normalizeTimestamp(chunkRecord.createdAt)
  if (createdAt) {
    observation.createdAt ??= createdAt
  }

  const usage = normalizeUsageMetrics(chunkRecord.totalUsage)
  if (!usage) {
    if (typeof chunkRecord.finishReason === 'string') {
      observation.finishReason = chunkRecord.finishReason
    }

    return chunk
  }

  observation.totalUsage = usage
  observation.rawUsage = chunkRecord.totalUsage
  if (typeof chunkRecord.finishReason === 'string') {
    observation.finishReason = chunkRecord.finishReason
  }

  const existingMetadata =
    chunkRecord.messageMetadata &&
    typeof chunkRecord.messageMetadata === 'object' &&
    !Array.isArray(chunkRecord.messageMetadata)
      ? (chunkRecord.messageMetadata as Record<string, unknown>)
      : {}

  return {
    ...(chunkRecord as UIMessageChunk),
    messageMetadata: {
      ...existingMetadata,
      usage
    }
  } as UIMessageChunk
}

export function normalizeUsageMetrics(value: unknown): ThreadUsageMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  return {
    inputTokens: normalizeInteger(record.inputTokens),
    outputTokens: normalizeInteger(record.outputTokens),
    totalTokens: normalizeInteger(record.totalTokens),
    reasoningTokens: normalizeInteger(record.reasoningTokens),
    cachedInputTokens: normalizeInteger(record.cachedInputTokens)
  }
}

export function normalizeInteger(value: unknown): number {
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

export function normalizeTimestamp(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString()
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.valueOf())) {
      return parsedDate.toISOString()
    }
  }

  return null
}

import type { UIMessage } from 'ai'

export type ThreadMessageUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}

export type ThreadUsageSummary = ThreadMessageUsage & {
  assistantMessageCount: number
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

export function extractThreadMessageUsage(metadata: unknown): ThreadMessageUsage | null {
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

export function deriveThreadUsageFromMessages(
  messages: readonly UIMessage[]
): ThreadUsageSummary | null {
  let assistantMessageCount = 0
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let reasoningTokens = 0
  let cachedInputTokens = 0

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue
    }

    const usage = extractThreadMessageUsage(
      (message as UIMessage & { metadata?: unknown }).metadata ?? null
    )
    if (!usage) {
      continue
    }

    assistantMessageCount += 1
    inputTokens += usage.inputTokens
    outputTokens += usage.outputTokens
    totalTokens += usage.totalTokens
    reasoningTokens += usage.reasoningTokens
    cachedInputTokens += usage.cachedInputTokens
  }

  if (assistantMessageCount === 0) {
    return null
  }

  return {
    assistantMessageCount,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens
  }
}

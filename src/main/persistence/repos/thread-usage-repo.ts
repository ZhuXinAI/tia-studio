import type { AppDatabase } from '../client'

type ThreadUsageMetrics = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}

export type ThreadMessageUsageRecord = ThreadUsageMetrics & {
  messageId: string
  threadId: string
  assistantId: string
  resourceId: string
  providerId: string | null
  model: string | null
  stepCount: number
  finishReason: string | null
  source: string
  rawUsage: unknown
  createdAt: string
  updatedAt: string
}

export type ThreadUsageTotals = ThreadUsageMetrics & {
  threadId: string
  assistantMessageCount: number
}

export type RecordMessageUsageInput = {
  messageId: string
  threadId: string
  assistantId: string
  resourceId: string
  providerId?: string | null
  model?: string | null
  source: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    reasoningTokens?: number
    cachedInputTokens?: number
  }
  rawUsage?: unknown
  stepCount: number
  finishReason?: string | null
  createdAt: string
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

function normalizeUsageMetrics(
  input: Pick<
    RecordMessageUsageInput['usage'],
    'inputTokens' | 'outputTokens' | 'totalTokens' | 'reasoningTokens' | 'cachedInputTokens'
  >
): ThreadUsageMetrics {
  return {
    inputTokens: normalizeInteger(input.inputTokens),
    outputTokens: normalizeInteger(input.outputTokens),
    totalTokens: normalizeInteger(input.totalTokens),
    reasoningTokens: normalizeInteger(input.reasoningTokens),
    cachedInputTokens: normalizeInteger(input.cachedInputTokens)
  }
}

function parseRawUsageJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {}
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function serializeRawUsage(value: unknown): string {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

function parseThreadMessageUsageRow(row: Record<string, unknown>): ThreadMessageUsageRecord {
  return {
    messageId: String(row.message_id),
    threadId: String(row.thread_id),
    assistantId: String(row.assistant_id),
    resourceId: String(row.resource_id),
    providerId: row.provider_id ? String(row.provider_id) : null,
    model: row.model ? String(row.model) : null,
    inputTokens: normalizeInteger(row.input_tokens),
    outputTokens: normalizeInteger(row.output_tokens),
    totalTokens: normalizeInteger(row.total_tokens),
    reasoningTokens: normalizeInteger(row.reasoning_tokens),
    cachedInputTokens: normalizeInteger(row.cached_input_tokens),
    stepCount: normalizeInteger(row.step_count),
    finishReason: row.finish_reason ? String(row.finish_reason) : null,
    source: String(row.source),
    rawUsage: parseRawUsageJson(row.raw_usage_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function parseThreadUsageTotalsRow(row: Record<string, unknown>): ThreadUsageTotals {
  return {
    threadId: String(row.thread_id),
    assistantMessageCount: normalizeInteger(row.assistant_message_count),
    inputTokens: normalizeInteger(row.input_tokens_total),
    outputTokens: normalizeInteger(row.output_tokens_total),
    totalTokens: normalizeInteger(row.total_tokens_total),
    reasoningTokens: normalizeInteger(row.reasoning_tokens_total),
    cachedInputTokens: normalizeInteger(row.cached_input_tokens_total)
  }
}

function subtractMetrics(left: ThreadUsageMetrics, right: ThreadUsageMetrics): ThreadUsageMetrics {
  return {
    inputTokens: left.inputTokens - right.inputTokens,
    outputTokens: left.outputTokens - right.outputTokens,
    totalTokens: left.totalTokens - right.totalTokens,
    reasoningTokens: left.reasoningTokens - right.reasoningTokens,
    cachedInputTokens: left.cachedInputTokens - right.cachedInputTokens
  }
}

export class ThreadUsageRepository {
  constructor(private readonly db: AppDatabase) {}

  async recordMessageUsage(input: RecordMessageUsageInput): Promise<void> {
    const usage = normalizeUsageMetrics(input.usage)
    const nextRowValues = [
      input.messageId,
      input.threadId,
      input.assistantId,
      input.resourceId,
      input.providerId ?? null,
      input.model ?? null,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      usage.reasoningTokens,
      usage.cachedInputTokens,
      normalizeInteger(input.stepCount),
      input.finishReason ?? null,
      input.source,
      serializeRawUsage(input.rawUsage ?? input.usage),
      input.createdAt
    ]

    let hasStartedTransaction = false

    try {
      await this.db.execute('BEGIN IMMEDIATE')
      hasStartedTransaction = true

      const existingResult = await this.db.execute(
        `
          SELECT
            message_id,
            thread_id,
            assistant_id,
            resource_id,
            provider_id,
            model,
            input_tokens,
            output_tokens,
            total_tokens,
            reasoning_tokens,
            cached_input_tokens,
            step_count,
            finish_reason,
            source,
            raw_usage_json,
            created_at,
            updated_at
          FROM app_thread_message_usage
          WHERE message_id = ?
          LIMIT 1
        `,
        [input.messageId]
      )

      const existingRow = existingResult.rows.at(0)
      const previous = existingRow
        ? parseThreadMessageUsageRow(existingRow as Record<string, unknown>)
        : null

      await this.db.execute(
        `
          INSERT INTO app_thread_message_usage (
            message_id,
            thread_id,
            assistant_id,
            resource_id,
            provider_id,
            model,
            input_tokens,
            output_tokens,
            total_tokens,
            reasoning_tokens,
            cached_input_tokens,
            step_count,
            finish_reason,
            source,
            raw_usage_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(message_id)
          DO UPDATE SET
            thread_id = excluded.thread_id,
            assistant_id = excluded.assistant_id,
            resource_id = excluded.resource_id,
            provider_id = excluded.provider_id,
            model = excluded.model,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            total_tokens = excluded.total_tokens,
            reasoning_tokens = excluded.reasoning_tokens,
            cached_input_tokens = excluded.cached_input_tokens,
            step_count = excluded.step_count,
            finish_reason = excluded.finish_reason,
            source = excluded.source,
            raw_usage_json = excluded.raw_usage_json,
            created_at = excluded.created_at,
            updated_at = CURRENT_TIMESTAMP
        `,
        nextRowValues
      )

      if (previous && previous.threadId !== input.threadId) {
        await this.applyThreadTotalsDelta(previous.threadId, -1, {
          inputTokens: -previous.inputTokens,
          outputTokens: -previous.outputTokens,
          totalTokens: -previous.totalTokens,
          reasoningTokens: -previous.reasoningTokens,
          cachedInputTokens: -previous.cachedInputTokens
        })

        await this.applyThreadTotalsDelta(input.threadId, 1, usage)
      } else {
        const delta = previous ? subtractMetrics(usage, previous) : usage

        await this.applyThreadTotalsDelta(input.threadId, previous ? 0 : 1, delta)
      }

      await this.db.execute('COMMIT')
    } catch (error) {
      if (hasStartedTransaction) {
        await this.db.execute('ROLLBACK').catch(() => undefined)
      }
      throw error
    }
  }

  async listByMessageIds(messageIds: string[]): Promise<Record<string, ThreadMessageUsageRecord>> {
    if (messageIds.length === 0) {
      return {}
    }

    const placeholders = messageIds.map(() => '?').join(', ')
    const result = await this.db.execute(
      `
        SELECT
          message_id,
          thread_id,
          assistant_id,
          resource_id,
          provider_id,
          model,
          input_tokens,
          output_tokens,
          total_tokens,
          reasoning_tokens,
          cached_input_tokens,
          step_count,
          finish_reason,
          source,
          raw_usage_json,
          created_at,
          updated_at
        FROM app_thread_message_usage
        WHERE message_id IN (${placeholders})
      `,
      messageIds
    )

    const usageByMessageId: Record<string, ThreadMessageUsageRecord> = {}
    for (const row of result.rows) {
      const parsed = parseThreadMessageUsageRow(row as Record<string, unknown>)
      usageByMessageId[parsed.messageId] = parsed
    }

    return usageByMessageId
  }

  async getThreadTotals(threadId: string): Promise<ThreadUsageTotals | null> {
    const result = await this.db.execute(
      `
        SELECT
          thread_id,
          assistant_message_count,
          input_tokens_total,
          output_tokens_total,
          total_tokens_total,
          reasoning_tokens_total,
          cached_input_tokens_total
        FROM app_thread_usage_totals
        WHERE thread_id = ?
        LIMIT 1
      `,
      [threadId]
    )

    const row = result.rows.at(0)
    if (!row) {
      return null
    }

    return parseThreadUsageTotalsRow(row as Record<string, unknown>)
  }

  async listThreadTotals(threadIds: string[]): Promise<Record<string, ThreadUsageTotals>> {
    if (threadIds.length === 0) {
      return {}
    }

    const placeholders = threadIds.map(() => '?').join(', ')
    const result = await this.db.execute(
      `
        SELECT
          thread_id,
          assistant_message_count,
          input_tokens_total,
          output_tokens_total,
          total_tokens_total,
          reasoning_tokens_total,
          cached_input_tokens_total
        FROM app_thread_usage_totals
        WHERE thread_id IN (${placeholders})
      `,
      threadIds
    )

    const totalsByThreadId: Record<string, ThreadUsageTotals> = {}
    for (const row of result.rows) {
      const parsed = parseThreadUsageTotalsRow(row as Record<string, unknown>)
      totalsByThreadId[parsed.threadId] = parsed
    }

    return totalsByThreadId
  }

  private async applyThreadTotalsDelta(
    threadId: string,
    assistantMessageCountDelta: number,
    delta: ThreadUsageMetrics
  ): Promise<void> {
    const hasTokenDelta =
      delta.inputTokens !== 0 ||
      delta.outputTokens !== 0 ||
      delta.totalTokens !== 0 ||
      delta.reasoningTokens !== 0 ||
      delta.cachedInputTokens !== 0

    if (assistantMessageCountDelta === 0 && !hasTokenDelta) {
      return
    }

    await this.db.execute(
      `
        INSERT INTO app_thread_usage_totals (
          thread_id,
          assistant_message_count,
          input_tokens_total,
          output_tokens_total,
          total_tokens_total,
          reasoning_tokens_total,
          cached_input_tokens_total,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(thread_id)
        DO UPDATE SET
          assistant_message_count = app_thread_usage_totals.assistant_message_count + excluded.assistant_message_count,
          input_tokens_total = app_thread_usage_totals.input_tokens_total + excluded.input_tokens_total,
          output_tokens_total = app_thread_usage_totals.output_tokens_total + excluded.output_tokens_total,
          total_tokens_total = app_thread_usage_totals.total_tokens_total + excluded.total_tokens_total,
          reasoning_tokens_total = app_thread_usage_totals.reasoning_tokens_total + excluded.reasoning_tokens_total,
          cached_input_tokens_total = app_thread_usage_totals.cached_input_tokens_total + excluded.cached_input_tokens_total,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        threadId,
        assistantMessageCountDelta,
        delta.inputTokens,
        delta.outputTokens,
        delta.totalTokens,
        delta.reasoningTokens,
        delta.cachedInputTokens
      ]
    )

    await this.db.execute(
      'DELETE FROM app_thread_usage_totals WHERE thread_id = ? AND assistant_message_count <= 0',
      [threadId]
    )
  }
}

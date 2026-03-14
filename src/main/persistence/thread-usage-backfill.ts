import { createAppDatabase, type AppDatabase } from './client'
import { ThreadUsageRepository } from './repos/thread-usage-repo'

const THREAD_USAGE_BACKFILL_KEY = 'thread_usage_backfill_v1'

type RunThreadUsageBackfillInput = {
  appDb: AppDatabase
  mastraDbPath: string
  usageRepo: ThreadUsageRepository
}

type ThreadBackfillContext = {
  threadId: string
  assistantId: string
  resourceId: string
  providerId: string | null
  model: string | null
}

type ParsedUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens?: number
  cachedInputTokens?: number
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

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function extractUsage(contentJson: unknown): ParsedUsage | null {
  if (!contentJson || typeof contentJson !== 'object' || Array.isArray(contentJson)) {
    return null
  }

  const metadata = (contentJson as Record<string, unknown>).metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const usage = (metadata as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null
  }

  const normalizedUsage = {
    inputTokens: normalizeInteger((usage as Record<string, unknown>).inputTokens),
    outputTokens: normalizeInteger((usage as Record<string, unknown>).outputTokens),
    totalTokens: normalizeInteger((usage as Record<string, unknown>).totalTokens),
    reasoningTokens: normalizeInteger((usage as Record<string, unknown>).reasoningTokens),
    cachedInputTokens: normalizeInteger((usage as Record<string, unknown>).cachedInputTokens)
  }

  if (
    normalizedUsage.inputTokens === 0 &&
    normalizedUsage.outputTokens === 0 &&
    normalizedUsage.totalTokens === 0 &&
    normalizedUsage.reasoningTokens === 0 &&
    normalizedUsage.cachedInputTokens === 0
  ) {
    return null
  }

  return normalizedUsage
}

async function hasCompletedBackfill(appDb: AppDatabase): Promise<boolean> {
  const result = await appDb.execute('SELECT value FROM app_preferences WHERE key = ? LIMIT 1', [
    THREAD_USAGE_BACKFILL_KEY
  ])
  const row = result.rows.at(0) as Record<string, unknown> | undefined

  return String(row?.value ?? '').trim().toLowerCase() === 'true'
}

async function markBackfillComplete(appDb: AppDatabase): Promise<void> {
  await appDb.execute(
    `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `,
    [THREAD_USAGE_BACKFILL_KEY, 'true']
  )
}

async function loadThreadContexts(appDb: AppDatabase): Promise<Map<string, ThreadBackfillContext>> {
  const result = await appDb.execute(
    `
      SELECT
        t.id AS thread_id,
        t.resource_id,
        t.assistant_id,
        a.provider_id,
        p.selected_model
      FROM app_threads t
      INNER JOIN app_assistants a ON a.id = t.assistant_id
      LEFT JOIN app_providers p ON p.id = a.provider_id
    `
  )

  const contexts = new Map<string, ThreadBackfillContext>()
  for (const row of result.rows) {
    const record = row as Record<string, unknown>
    const threadId = String(record.thread_id)

    contexts.set(threadId, {
      threadId,
      assistantId: String(record.assistant_id),
      resourceId: String(record.resource_id),
      providerId: record.provider_id ? String(record.provider_id) : null,
      model: record.selected_model ? String(record.selected_model) : null
    })
  }

  return contexts
}

export async function runThreadUsageBackfill(
  input: RunThreadUsageBackfillInput
): Promise<void> {
  if (await hasCompletedBackfill(input.appDb)) {
    return
  }

  const threadContexts = await loadThreadContexts(input.appDb)
  if (threadContexts.size === 0) {
    await markBackfillComplete(input.appDb)
    return
  }

  const mastraDb = createAppDatabase(input.mastraDbPath)

  try {
    const result = await mastraDb.execute(
      `
        SELECT id, thread_id, content, "createdAt"
        FROM mastra_messages
        WHERE role = 'assistant'
      `
    )

    for (const row of result.rows) {
      const record = row as Record<string, unknown>
      const threadId = String(record.thread_id)
      const threadContext = threadContexts.get(threadId)
      if (!threadContext) {
        continue
      }

      const content = parseJsonObject(record.content)
      if (!content) {
        continue
      }

      const usage = extractUsage(content)
      if (!usage) {
        continue
      }

      const metadata =
        content.metadata && typeof content.metadata === 'object' && !Array.isArray(content.metadata)
          ? (content.metadata as Record<string, unknown>)
          : null

      await input.usageRepo.recordMessageUsage({
        messageId: String(record.id),
        threadId,
        assistantId: threadContext.assistantId,
        resourceId: threadContext.resourceId,
        providerId: threadContext.providerId,
        model: threadContext.model,
        source: 'backfill',
        usage,
        rawUsage: usage,
        stepCount: normalizeInteger(metadata?.stepCount),
        finishReason: metadata?.finishReason ? String(metadata.finishReason) : null,
        createdAt: String(record.createdAt)
      })
    }

    await markBackfillComplete(input.appDb)
  } finally {
    mastraDb.close()
  }
}

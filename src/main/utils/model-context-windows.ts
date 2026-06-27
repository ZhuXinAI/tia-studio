const KNOWN_MODEL_CONTEXT_WINDOW_TOKENS = new Map<string, number>([
  ['gpt-4o', 128_000],
  ['gpt-5', 400_000],
  ['gpt-5-mini', 400_000],
  ['gpt-5-nano', 400_000],
  ['openai/gpt-4o', 128_000],
  ['openai/gpt-5', 400_000],
  ['openai/gpt-5-mini', 400_000],
  ['openai/gpt-5-nano', 400_000],
  ['gemini-2.0-flash', 1_048_576],
  ['gemini-2.0-flash-exp', 1_048_576],
  ['gemini-2.5-flash', 1_048_576]
])

export type ModelContextWindowTokensByModel = Record<string, number>

function normalizeModelKey(value: string): string {
  const trimmedValue = value.trim().toLowerCase()
  return trimmedValue.startsWith('models/') ? trimmedValue.slice('models/'.length) : trimmedValue
}

export function inferKnownModelContextWindowTokens(selectedModel: string): number | null {
  if (selectedModel.trim().length === 0) {
    return null
  }

  return KNOWN_MODEL_CONTEXT_WINDOW_TOKENS.get(normalizeModelKey(selectedModel)) ?? null
}

export function normalizeModelContextWindowTokens(value: unknown): number | null {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : null

  if (numericValue === null || !Number.isFinite(numericValue) || numericValue <= 0) {
    return null
  }

  return Math.round(numericValue)
}

export function deriveModelContextWindowTokensByModel(input: {
  selectedModel: string
  selectedModelContextWindowTokens?: unknown
  providerModels?: readonly string[] | null
}): ModelContextWindowTokensByModel | null {
  const entries = new Map<string, number>()

  for (const model of input.providerModels ?? []) {
    const normalizedModel = normalizeModelKey(model)
    const inferredContextWindowTokens = inferKnownModelContextWindowTokens(model)
    if (normalizedModel.length === 0 || !inferredContextWindowTokens) {
      continue
    }

    entries.set(normalizedModel, inferredContextWindowTokens)
  }

  const normalizedSelectedModel = normalizeModelKey(input.selectedModel)
  const selectedModelContextWindowTokens =
    normalizeModelContextWindowTokens(input.selectedModelContextWindowTokens) ??
    inferKnownModelContextWindowTokens(input.selectedModel)

  if (normalizedSelectedModel.length > 0 && selectedModelContextWindowTokens) {
    entries.set(normalizedSelectedModel, selectedModelContextWindowTokens)
  }

  return entries.size > 0 ? Object.fromEntries(entries) : null
}

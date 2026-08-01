const defaultTimeoutMs = 8000
const smokeTestPrompt = 'Reply with exactly: hi'
const maxReplyLength = 240

type ProviderType = 'openai' | 'openai-response' | 'openrouter' | 'gemini' | 'anthropic' | 'ollama'

export type ProviderConnectionInput = {
  type: ProviderType
  apiKey: string
  apiHost?: string
  selectedModel: string
}

export type ProviderConnectionResult = {
  reply: string
}

type ConnectionRequest = {
  url: string
  headers: Record<string, string>
  body: string
}

type TestProviderConnectionOptions = {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}

function normalizeModelId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('models/')) {
    return trimmed.slice('models/'.length)
  }

  return trimmed
}

function isDeepSeekModel(input: ProviderConnectionInput): boolean {
  return input.type === 'openai' && input.selectedModel.toLowerCase().includes('deepseek')
}

function jsonBody(payload: unknown): string {
  return JSON.stringify(payload)
}

function buildConnectionRequest(input: ProviderConnectionInput): ConnectionRequest {
  const selectedModel = normalizeModelId(input.selectedModel)

  if (input.type === 'openai' || input.type === 'openrouter') {
    const body: Record<string, unknown> = {
      model: selectedModel,
      messages: [{ role: 'user', content: smokeTestPrompt }],
      max_tokens: 16,
      temperature: 0,
      stream: false
    }

    if (input.type === 'openrouter') {
      body.reasoning = { effort: 'none' }
    } else if (isDeepSeekModel(input)) {
      body.thinking = { type: 'disabled' }
    }

    return {
      url: joinUrl(
        input.apiHost ??
          (input.type === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : 'https://api.openai.com/v1'),
        '/chat/completions'
      ),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: jsonBody(body)
    }
  }

  if (input.type === 'openai-response') {
    return {
      url: joinUrl(input.apiHost ?? 'https://api.openai.com/v1', '/responses'),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: jsonBody({
        model: selectedModel,
        input: smokeTestPrompt,
        max_output_tokens: 16
      })
    }
  }

  if (input.type === 'anthropic') {
    return {
      url: joinUrl(input.apiHost ?? 'https://api.anthropic.com/v1', '/messages'),
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: jsonBody({
        model: selectedModel,
        max_tokens: 16,
        temperature: 0,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: smokeTestPrompt }]
      })
    }
  }

  if (input.type === 'gemini') {
    const requestUrl = new URL(
      joinUrl(
        input.apiHost ?? 'https://generativelanguage.googleapis.com/v1beta',
        `/models/${encodeURIComponent(selectedModel)}:generateContent`
      )
    )
    requestUrl.searchParams.set('key', input.apiKey)

    return {
      url: requestUrl.toString(),
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({
        contents: [{ role: 'user', parts: [{ text: smokeTestPrompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  }

  return {
    url: joinUrl(input.apiHost ?? 'http://127.0.0.1:11434', '/api/chat'),
    headers: { 'Content-Type': 'application/json' },
    body: jsonBody({
      model: selectedModel,
      messages: [{ role: 'user', content: smokeTestPrompt }],
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 16 }
    })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compactText(value: string, limit = maxReplyLength): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized
}

function textFromContent(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((part) => {
    if (!isRecord(part)) return []
    if (typeof part.text === 'string') return [part.text]
    if (typeof part.output_text === 'string') return [part.output_text]
    return textFromContent(part.content)
  })
}

function extractReply(providerType: ProviderType, payload: unknown): string | null {
  if (!isRecord(payload)) return null

  if (providerType === 'gemini') {
    const candidates = payload.candidates
    if (!Array.isArray(candidates)) return null
    const text = candidates.flatMap((candidate) => {
      if (!isRecord(candidate)) return []
      return isRecord(candidate.content) ? textFromContent(candidate.content.parts) : []
    })
    return text.join('').trim() || null
  }

  if (providerType === 'ollama') {
    const message = isRecord(payload.message) ? payload.message.content : undefined
    const text = textFromContent(message)
    if (text.length > 0) return text.join('').trim() || null
    return typeof payload.response === 'string' ? payload.response.trim() || null : null
  }

  if (providerType === 'openai-response') {
    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
      return payload.output_text.trim()
    }

    const output = Array.isArray(payload.output) ? payload.output : []
    const text = output.flatMap((item) => (isRecord(item) ? textFromContent(item.content) : []))
    return text.join('').trim() || null
  }

  if (providerType === 'anthropic') {
    return textFromContent(payload.content).join('').trim() || null
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : []
  const text = choices.flatMap((choice) => {
    if (!isRecord(choice) || !isRecord(choice.message)) return []
    return textFromContent(choice.message.content)
  })
  return text.join('').trim() || null
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  for (const candidate of [payload.message, payload.detail, payload.error, payload.body]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
    if (isRecord(candidate)) {
      const nested = extractErrorMessage(candidate)
      if (nested) return nested
    }
  }

  return null
}

async function readErrorMessage(response: Response, rawBody: string): Promise<string> {
  if (rawBody.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawBody) as unknown
      const message = extractErrorMessage(parsed)
      if (message) return compactText(message)
    } catch {
      const message = compactText(rawBody)
      if (message) return message
    }
  }

  if (response.status === 401 || response.status === 403) {
    return 'Authentication failed. Check API key and provider permissions.'
  }

  if (response.status === 404) {
    return 'Connection endpoint not found. Check API host and protocol.'
  }

  return `Connection request failed with status ${response.status}.`
}

export async function testProviderConnection(
  input: ProviderConnectionInput,
  options: TestProviderConnectionOptions = {}
): Promise<ProviderConnectionResult> {
  const connectionRequest = buildConnectionRequest(input)
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetcher(connectionRequest.url, {
      method: 'POST',
      headers: connectionRequest.headers,
      body: connectionRequest.body,
      signal: abortController.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Connection request timed out. Check API host and network access.')
    }

    throw new Error('Unable to reach provider endpoint. Check API host and network access.')
  } finally {
    clearTimeout(timeoutId)
  }

  const rawBody = await response.text()
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, rawBody))
  }

  let payload: unknown = null
  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody) as unknown
    } catch {
      throw new Error('Provider returned an invalid response for the smoke test.')
    }
  }

  const reply = extractReply(input.type, payload)
  if (!reply) {
    throw new Error('Provider returned no text for the smoke test.')
  }

  return { reply: compactText(reply) }
}

const defaultTimeoutMs = 8000

type ProviderType = 'openai' | 'openai-response' | 'openrouter' | 'gemini' | 'anthropic' | 'ollama'

type ProviderConnectionInput = {
  type: ProviderType
  apiKey: string
  apiHost?: string
  selectedModel: string
}

type ConnectionRequest = {
  url: string
  headers?: Record<string, string>
}

type TestProviderConnectionOptions = {
  fetcher?: typeof fetch
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

function modelMatches(candidate: string, selectedModel: string): boolean {
  const normalizedCandidate = normalizeModelId(candidate)
  const normalizedSelected = normalizeModelId(selectedModel)

  return (
    normalizedCandidate === normalizedSelected ||
    normalizedCandidate.endsWith(`/${normalizedSelected}`) ||
    normalizedSelected.endsWith(`/${normalizedCandidate}`) ||
    normalizedCandidate.startsWith(`${normalizedSelected}:`) ||
    normalizedSelected.startsWith(`${normalizedCandidate}:`)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseModelIds(providerType: ProviderType, payload: unknown): string[] {
  if (!isRecord(payload)) {
    return []
  }

  if (providerType === 'gemini') {
    const models = payload.models
    if (!Array.isArray(models)) {
      return []
    }

    return models
      .filter(isRecord)
      .map((model) => model.name)
      .filter((name): name is string => typeof name === 'string')
      .map((name) => normalizeModelId(name))
  }

  if (providerType === 'ollama') {
    const models = payload.models
    if (!Array.isArray(models)) {
      return []
    }

    return models
      .filter(isRecord)
      .map((model) => model.name)
      .filter((name): name is string => typeof name === 'string')
  }

  const data = payload.data
  if (!Array.isArray(data)) {
    return []
  }

  return data
    .filter(isRecord)
    .map((model) => model.id)
    .filter((id): id is string => typeof id === 'string')
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  const message = payload.message
  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  const nestedError = payload.error
  if (isRecord(nestedError)) {
    const nestedMessage = nestedError.message
    if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
      return nestedMessage
    }
  }

  return null
}

function buildConnectionRequest(input: ProviderConnectionInput): ConnectionRequest {
  if (input.type === 'openai' || input.type === 'openai-response' || input.type === 'openrouter') {
    return {
      url: joinUrl(
        input.apiHost ??
          (input.type === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : 'https://api.openai.com/v1'),
        '/models'
      ),
      headers: {
        Authorization: `Bearer ${input.apiKey}`
      }
    }
  }

  if (input.type === 'anthropic') {
    return {
      url: joinUrl(input.apiHost ?? 'https://api.anthropic.com/v1', '/models'),
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01'
      }
    }
  }

  if (input.type === 'gemini') {
    const requestUrl = new URL(
      joinUrl(input.apiHost ?? 'https://generativelanguage.googleapis.com/v1beta', '/models')
    )
    requestUrl.searchParams.set('key', input.apiKey)

    return {
      url: requestUrl.toString()
    }
  }

  return {
    url: joinUrl(input.apiHost ?? 'http://127.0.0.1:11434', '/api/tags')
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const rawBody = await response.text()

  if (rawBody.length > 0) {
    try {
      const parsed = JSON.parse(rawBody) as unknown
      const message = extractErrorMessage(parsed)
      if (message) {
        return message
      }
    } catch {
      return rawBody
    }
  }

  if (response.status === 401 || response.status === 403) {
    return 'Authentication failed. Check API key and provider permissions.'
  }

  if (response.status === 404) {
    return 'Connection endpoint not found. Check API host.'
  }

  return `Connection check failed with status ${response.status}.`
}

async function readPayload(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

export async function testProviderConnection(
  input: ProviderConnectionInput,
  options: TestProviderConnectionOptions = {}
): Promise<void> {
  const connectionRequest = buildConnectionRequest(input)
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
  }, timeoutMs)

  let response: Response
  try {
    response = await fetcher(connectionRequest.url, {
      method: 'GET',
      headers: connectionRequest.headers,
      signal: abortController.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Connection check timed out. Check API host and network access.')
    }

    throw new Error('Unable to reach provider endpoint. Check API host and network access.')
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const payload = await readPayload(response)
  const availableModels = parseModelIds(input.type, payload)
  if (availableModels.length === 0) {
    return
  }

  if (!availableModels.some((modelId) => modelMatches(modelId, input.selectedModel))) {
    throw new Error(`Connection succeeded, but model "${input.selectedModel}" was not found.`)
  }
}

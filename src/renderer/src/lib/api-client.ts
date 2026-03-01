import { getDesktopConfig } from './desktop-config'

type HttpMethod = 'GET' | 'POST' | 'PATCH'

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const config = await getDesktopConfig()
  const response = await fetch(joinUrl(config.baseUrl, path), {
    method,
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function createApiClient() {
  return {
    get: <T>(path: string): Promise<T> => request<T>('GET', path),
    post: <T>(path: string, body?: Record<string, unknown>): Promise<T> =>
      request<T>('POST', path, body),
    patch: <T>(path: string, body?: Record<string, unknown>): Promise<T> =>
      request<T>('PATCH', path, body)
  }
}

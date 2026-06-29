import { getDesktopBootstrap } from './desktop-bootstrap'
import { createHttpError } from './request-errors'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

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
  const bootstrap = await getDesktopBootstrap()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (bootstrap.authMode === 'bearer' && bootstrap.authToken?.trim()) {
    headers.Authorization = `Bearer ${bootstrap.authToken}`
  }

  const response = await fetch(joinUrl(bootstrap.apiBaseUrl, path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw createHttpError(response.status, errorText)
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
      request<T>('PATCH', path, body),
    put: <T>(path: string, body?: Record<string, unknown>): Promise<T> =>
      request<T>('PUT', path, body),
    delete: <T = void>(path: string): Promise<T> => request<T>('DELETE', path)
  }
}

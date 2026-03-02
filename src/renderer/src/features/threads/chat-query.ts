import { DefaultChatTransport, type UIMessage } from 'ai'
import { getDesktopConfig } from '../../lib/desktop-config'

type ThreadChatTransportInput = {
  assistantId: string
  threadId: string
  profileId: string
}

type ThreadChatHistoryInput = {
  assistantId: string
  threadId: string
  profileId: string
}

type DesktopChatFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function resolveDesktopChatUrl(baseUrl: string, input: string): string {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = input.startsWith('/') ? input : `/${input}`
  return `${normalizedBase}${normalizedPath}`
}

export function createDesktopChatFetch(): DesktopChatFetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const config = await getDesktopConfig()
    const requestUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const resolvedUrl = resolveDesktopChatUrl(config.baseUrl, requestUrl)
    const headers = new Headers(init?.headers)
    if (config.authToken.trim().length > 0) {
      headers.set('Authorization', `Bearer ${config.authToken}`)
    }

    return fetch(resolvedUrl, {
      ...init,
      headers
    })
  }
}

export async function listThreadChatMessages(input: ThreadChatHistoryInput): Promise<UIMessage[]> {
  const chatFetch = createDesktopChatFetch()
  const params = new URLSearchParams({
    threadId: input.threadId,
    profileId: input.profileId
  })
  const response = await chatFetch(`/chat/${input.assistantId}/history?${params.toString()}`, {
    method: 'GET'
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as UIMessage[]
}

export function createThreadChatTransport(
  input: ThreadChatTransportInput
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: `/chat/${input.assistantId}`,
    body: {
      threadId: input.threadId,
      profileId: input.profileId
    },
    fetch: createDesktopChatFetch()
  })
}

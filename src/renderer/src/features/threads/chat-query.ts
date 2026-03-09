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

export type ThreadMessageEventType = 'thread-messages-updated'

export type ThreadMessageEvent = {
  type: ThreadMessageEventType
  assistantId: string
  threadId: string
  profileId: string
  source: 'channel'
  createdAt: string
}

export type ThreadMessageEventStreamHandle = {
  close: () => void
  done: Promise<void>
}

type DesktopChatFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function parseEventChunk(chunk: string): ThreadMessageEvent[] {
  return chunk
    .split('\n\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .flatMap((item) => {
      const dataLines = item
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())

      if (dataLines.length === 0) {
        return []
      }

      try {
        return [JSON.parse(dataLines.join('\n')) as ThreadMessageEvent]
      } catch {
        return []
      }
    })
}

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
    prepareSendMessagesRequest({ body, id, messages }) {
      return {
        body: {
          ...body,
          id,
          messages: messages.slice(-1)
        }
      }
    },
    fetch: createDesktopChatFetch()
  })
}

export function openAssistantMessageEventsStream(input: {
  assistantId: string
  profileId: string
  onEvent: (event: ThreadMessageEvent) => void
  onError?: (error: unknown) => void
}): ThreadMessageEventStreamHandle {
  const abortController = new AbortController()

  const done = (async () => {
    try {
      const config = await getDesktopConfig()
      const normalizedBaseUrl = config.baseUrl.endsWith('/')
        ? config.baseUrl.slice(0, -1)
        : config.baseUrl
      const params = new URLSearchParams({
        profileId: input.profileId
      })
      const response = await fetch(
        `${normalizedBaseUrl}/chat/${input.assistantId}/events?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.authToken}`
          },
          signal: abortController.signal
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Request failed with status ${response.status}`)
      }

      if (!response.body) {
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done: isDone, value } = await reader.read()
        if (isDone) {
          buffer += decoder.decode()
          for (const event of parseEventChunk(buffer)) {
            input.onEvent(event)
          }
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lastDelimiterIndex = buffer.lastIndexOf('\n\n')
        if (lastDelimiterIndex === -1) {
          continue
        }

        const completeChunk = buffer.slice(0, lastDelimiterIndex + 2)
        buffer = buffer.slice(lastDelimiterIndex + 2)

        for (const event of parseEventChunk(completeChunk)) {
          input.onEvent(event)
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return
      }

      input.onError?.(error)
    }
  })()

  return {
    close: () => abortController.abort(),
    done
  }
}

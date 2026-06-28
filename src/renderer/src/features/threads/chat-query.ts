import { DefaultChatTransport, type UIMessage } from 'ai'
import { getDesktopBootstrap } from '../../lib/desktop-bootstrap'

type ThreadChatTransportInput = {
  threadId: string
  profileId: string
}

type ThreadChatHistoryInput = {
  threadId: string
  profileId: string
}

type RunThreadCommandInput = {
  threadId: string
  profileId: string
  text: string
}

type HandledThreadCommandResult =
  | {
      ok: true
      handled: true
      command: 'stop'
      stopped: boolean
    }
  | {
      ok: true
      handled: true
      command: 'new'
      archiveFileName: string
      archiveFilePath: string
      threadTitle: string
      compactedAt: string
    }

export type ThreadCommandResult =
  | {
      ok: true
      handled: false
    }
  | HandledThreadCommandResult

export type ThreadCommandHandledResult = Extract<ThreadCommandResult, { handled: true }>

export type ThreadCommandNewResult = Extract<ThreadCommandResult, { command: 'new' }>

export type ThreadCommandStopResult = Extract<ThreadCommandResult, { command: 'stop' }>

export type ThreadMessageEventType = 'thread-messages-updated'

export type ThreadMessageEvent = {
  type: ThreadMessageEventType
  assistantId: string
  threadId: string
  profileId: string
  source: 'channel' | 'command'
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
    const bootstrap = await getDesktopBootstrap()
    const requestUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const resolvedUrl = resolveDesktopChatUrl(bootstrap.apiBaseUrl, requestUrl)
    const headers = new Headers(init?.headers)
    if (bootstrap.authMode === 'bearer' && bootstrap.authToken?.trim().length) {
      headers.set('Authorization', `Bearer ${bootstrap.authToken}`)
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
  const response = await chatFetch(`/chat/history?${params.toString()}`, {
    method: 'GET'
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as UIMessage[]
}

export async function runThreadCommand(input: RunThreadCommandInput): Promise<ThreadCommandResult> {
  const chatFetch = createDesktopChatFetch()
  const response = await chatFetch('/chat/commands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: input.text,
      threadId: input.threadId,
      profileId: input.profileId
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as ThreadCommandResult
}

export function createThreadChatTransport(
  input: ThreadChatTransportInput
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: '/chat/v2',
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
  return openMessageEventsStream({
    path: `/chat/${input.assistantId}/events`,
    profileId: input.profileId,
    onEvent: input.onEvent,
    onError: input.onError
  })
}

export function openThreadMessageEventsStream(input: {
  profileId: string
  onEvent: (event: ThreadMessageEvent) => void
  onError?: (error: unknown) => void
}): ThreadMessageEventStreamHandle {
  return openMessageEventsStream({
    path: '/chat/events',
    profileId: input.profileId,
    onEvent: input.onEvent,
    onError: input.onError
  })
}

function openMessageEventsStream(input: {
  path: string
  profileId: string
  onEvent: (event: ThreadMessageEvent) => void
  onError?: (error: unknown) => void
}): ThreadMessageEventStreamHandle {
  const abortController = new AbortController()

  const done = (async () => {
    try {
      const bootstrap = await getDesktopBootstrap()
      const normalizedBaseUrl = bootstrap.apiBaseUrl.endsWith('/')
        ? bootstrap.apiBaseUrl.slice(0, -1)
        : bootstrap.apiBaseUrl
      const params = new URLSearchParams({
        profileId: input.profileId
      })
      const headers: Record<string, string> = {}
      if (bootstrap.authMode === 'bearer' && bootstrap.authToken?.trim().length) {
        headers.Authorization = `Bearer ${bootstrap.authToken}`
      }
      const response = await fetch(`${normalizedBaseUrl}${input.path}?${params.toString()}`, {
        method: 'GET',
        headers,
        signal: abortController.signal
      })

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

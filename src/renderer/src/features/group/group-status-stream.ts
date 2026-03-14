import { getDesktopConfig } from '../../lib/desktop-config'

export type GroupStatusEventType =
  | 'run-started'
  | 'speaker-selected'
  | 'turn-started'
  | 'message-posted'
  | 'turn-passed'
  | 'run-finished'
  | 'run-failed'

export type GroupStatusEvent = {
  type: GroupStatusEventType
  runId: string
  threadId: string
  createdAt: string
  data?: Record<string, unknown>
}

export type GroupStatusStreamHandle = {
  close: () => void
  done: Promise<void>
}

const GROUP_STATUS_NOT_FOUND_RETRY_COUNT = 6
const GROUP_STATUS_NOT_FOUND_RETRY_DELAY_MS = 150

function parseEventChunk(chunk: string): GroupStatusEvent[] {
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
        return [JSON.parse(dataLines.join('\n')) as GroupStatusEvent]
      } catch {
        return []
      }
    })
}

async function fetchGroupStatusResponse(input: {
  baseUrl: string
  authToken: string
  threadId: string
  runId: string
  signal: AbortSignal
}): Promise<Response | null> {
  for (let attempt = 0; attempt <= GROUP_STATUS_NOT_FOUND_RETRY_COUNT; attempt += 1) {
    if (input.signal.aborted) {
      return null
    }

    const response = await fetch(
      `${input.baseUrl}/group-chat/${input.threadId}/runs/${input.runId}/status`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.authToken}`
        },
        signal: input.signal
      }
    )

    if (response.status !== 404 || attempt === GROUP_STATUS_NOT_FOUND_RETRY_COUNT) {
      return response
    }

    await new Promise((resolve) => setTimeout(resolve, GROUP_STATUS_NOT_FOUND_RETRY_DELAY_MS))
  }

  return null
}

export function openGroupStatusStream(input: {
  threadId: string
  runId: string
  onEvent: (event: GroupStatusEvent) => void
  onError?: (error: unknown) => void
}): GroupStatusStreamHandle {
  const abortController = new AbortController()

  const done = (async () => {
    try {
      const config = await getDesktopConfig()
      const normalizedBaseUrl = config.baseUrl.endsWith('/')
        ? config.baseUrl.slice(0, -1)
        : config.baseUrl
      const response = await fetchGroupStatusResponse({
        baseUrl: normalizedBaseUrl,
        authToken: config.authToken,
        threadId: input.threadId,
        runId: input.runId,
        signal: abortController.signal
      })

      if (!response) {
        return
      }

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

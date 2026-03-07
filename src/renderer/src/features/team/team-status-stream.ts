import { getDesktopConfig } from '../../lib/desktop-config'

export type TeamStatusEventType =
  | 'run-started'
  | 'delegation-started'
  | 'delegation-finished'
  | 'iteration-complete'
  | 'run-finished'
  | 'run-failed'

export type TeamStatusEvent = {
  type: TeamStatusEventType
  runId: string
  threadId: string
  createdAt: string
  data?: Record<string, unknown>
}

export type TeamStatusStreamHandle = {
  close: () => void
  done: Promise<void>
}

function parseEventChunk(chunk: string): TeamStatusEvent[] {
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
        return [JSON.parse(dataLines.join('\n')) as TeamStatusEvent]
      } catch {
        return []
      }
    })
}

export function openTeamStatusStream(input: {
  threadId: string
  runId: string
  onEvent: (event: TeamStatusEvent) => void
  onError?: (error: unknown) => void
}): TeamStatusStreamHandle {
  const abortController = new AbortController()

  const done = (async () => {
    try {
      const config = await getDesktopConfig()
      const normalizedBaseUrl = config.baseUrl.endsWith('/')
        ? config.baseUrl.slice(0, -1)
        : config.baseUrl
      const response = await fetch(
        `${normalizedBaseUrl}/team-chat/${input.threadId}/runs/${input.runId}/status`,
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

import { getDesktopConfig } from '../../lib/desktop-config'

export type GroupThreadEvent = {
  type: 'group-thread-message-created'
  threadId: string
  profileId: string
  messageId: string
  createdAt: string
}

export type GroupThreadEventsStreamHandle = {
  close: () => void
  done: Promise<void>
}

function parseEventChunk(chunk: string): GroupThreadEvent[] {
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
        return [JSON.parse(dataLines.join('\n')) as GroupThreadEvent]
      } catch {
        return []
      }
    })
}

export function openGroupThreadEventsStream(input: {
  threadId: string
  profileId: string
  onEvent: (event: GroupThreadEvent) => void
  onError?: (error: unknown) => void
}): GroupThreadEventsStreamHandle {
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
        `${normalizedBaseUrl}/group-chat/${input.threadId}/events?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.authToken}`
          },
          signal: abortController.signal
        }
      )

      if (response.status === 404) {
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

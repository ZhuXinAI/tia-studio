import { DefaultChatTransport, type UIMessage } from 'ai'
import { createDesktopChatFetch } from '../threads/chat-query'

type TeamChatTransportInput = {
  threadId: string
  profileId: string
  onRunStarted?: (runId: string) => void
}

type TeamChatHistoryInput = {
  threadId: string
  profileId: string
}

export function createTeamChatFetch(input: Pick<TeamChatTransportInput, 'onRunStarted'>) {
  const chatFetch = createDesktopChatFetch()

  return async (requestInfo: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await chatFetch(requestInfo, init)
    const runId = response.headers.get('x-team-run-id')
    if (runId) {
      input.onRunStarted?.(runId)
    }

    return response
  }
}

export async function listTeamThreadMessages(input: TeamChatHistoryInput): Promise<UIMessage[]> {
  const chatFetch = createDesktopChatFetch()
  const params = new URLSearchParams({
    profileId: input.profileId
  })
  const response = await chatFetch(`/team-chat/${input.threadId}/history?${params.toString()}`, {
    method: 'GET'
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as UIMessage[]
}

export function createTeamChatTransport(
  input: TeamChatTransportInput
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: `/team-chat/${input.threadId}`,
    body: {
      profileId: input.profileId
    },
    fetch: createTeamChatFetch({
      onRunStarted: input.onRunStarted
    })
  })
}

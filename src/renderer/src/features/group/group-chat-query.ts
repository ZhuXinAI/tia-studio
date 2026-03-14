import { createDesktopChatFetch } from '../threads/chat-query'

export type GroupRoomMessageRecord = {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  authorType: 'watcher' | 'assistant' | 'orchestrator'
  authorId: string | null
  authorName: string
  content: string
  mentions: string[]
  createdAt: string
}

export type SubmitGroupWatcherMessageInput = {
  threadId: string
  profileId: string
  content: string
  mentions?: string[]
}

export type SubmitGroupWatcherMessageResult = {
  runId: string
  messageId: string
}

function normalizeMessageRecord(record: GroupRoomMessageRecord): GroupRoomMessageRecord {
  return {
    ...record,
    authorId: typeof record.authorId === 'string' && record.authorId.length > 0 ? record.authorId : null,
    mentions: Array.isArray(record.mentions)
      ? record.mentions.filter((value): value is string => typeof value === 'string')
      : []
  }
}

export async function listGroupThreadMessages(input: {
  threadId: string
  profileId: string
}): Promise<GroupRoomMessageRecord[]> {
  const chatFetch = createDesktopChatFetch()
  const params = new URLSearchParams({
    profileId: input.profileId
  })
  const response = await chatFetch(`/group-chat/${input.threadId}/history?${params.toString()}`, {
    method: 'GET'
  })

  if (response.status === 404) {
    return []
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  const records = (await response.json()) as GroupRoomMessageRecord[]
  return records.map((record) => normalizeMessageRecord(record))
}

export async function submitGroupWatcherMessage(
  input: SubmitGroupWatcherMessageInput
): Promise<SubmitGroupWatcherMessageResult> {
  const chatFetch = createDesktopChatFetch()
  const response = await chatFetch(`/group-chat/${input.threadId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      profileId: input.profileId,
      content: input.content,
      ...(input.mentions && input.mentions.length > 0 ? { mentions: input.mentions } : {})
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as SubmitGroupWatcherMessageResult
}

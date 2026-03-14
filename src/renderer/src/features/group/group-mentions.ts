import type { MentionItem, SuggestionDataItem } from 'react-mentions'
import type { AssistantRecord } from '../assistants/assistants-query'

export function buildGroupMentionSuggestions(
  members: AssistantRecord[]
): SuggestionDataItem[] {
  return members.map((member) => ({
    id: member.id,
    display: member.name
  }))
}

export function extractUniqueMentionIds(mentions: MentionItem[]): string[] {
  const mentionIds: string[] = []

  for (const mention of mentions) {
    const mentionId = String(mention.id).trim()
    if (mentionId.length === 0 || mentionIds.includes(mentionId)) {
      continue
    }

    mentionIds.push(mentionId)
  }

  return mentionIds
}

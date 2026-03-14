export type GroupSpeaker = {
  assistantId: string
  name: string
}

type SelectNextGroupSpeakerInput = {
  members: GroupSpeaker[]
  recentMessages: Array<{ authorId: string | null; mentions: string[]; content: string }>
  speakersUsedInRun: string[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractMentionedAssistantIds(
  content: string,
  members: GroupSpeaker[]
): string[] {
  const resolvedMentions: string[] = []

  for (const member of members) {
    const mentionPatterns = [member.name, member.assistantId]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => new RegExp(`(^|\\s)@${escapeRegExp(value)}(?=\\s|$|[.,!?])`, 'i'))

    if (
      mentionPatterns.some((pattern) => pattern.test(content)) &&
      !resolvedMentions.includes(member.assistantId)
    ) {
      resolvedMentions.push(member.assistantId)
    }
  }

  return resolvedMentions
}

export function selectNextGroupSpeaker(
  input: SelectNextGroupSpeakerInput
): GroupSpeaker | null {
  const latestMessage = input.recentMessages.at(-1)
  const mentionIds =
    latestMessage && latestMessage.mentions.length > 0
      ? latestMessage.mentions
      : extractMentionedAssistantIds(latestMessage?.content ?? '', input.members)

  if (mentionIds.length > 0) {
    for (const mentionedAssistantId of mentionIds) {
      const mentionedMember = input.members.find(
        (member) =>
          member.assistantId === mentionedAssistantId &&
          member.assistantId !== (latestMessage?.authorId ?? null)
      )
      if (mentionedMember) {
        return mentionedMember
      }
    }
  }

  return (
    input.members.find((member) => !input.speakersUsedInRun.includes(member.assistantId)) ??
    input.members[0] ??
    null
  )
}

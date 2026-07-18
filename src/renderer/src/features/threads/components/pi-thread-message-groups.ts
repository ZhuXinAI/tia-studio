import type { AppAgentMessage } from '../../../../../shared/agent-runtime'

export function mergeAssistantRunMessages(messages: AppAgentMessage[]): AppAgentMessage[] {
  const merged: AppAgentMessage[] = []
  for (const message of messages) {
    const previous = merged.at(-1)
    if (message.role === 'assistant' && previous?.role === 'assistant') {
      merged[merged.length - 1] = {
        ...previous,
        parts: [
          ...previous.parts.map((part) =>
            part.type === 'text' ? { type: 'thinking' as const, text: part.text } : part
          ),
          ...message.parts
        ],
        status: message.status,
        completedAt: message.completedAt
      }
      continue
    }
    merged.push(message)
  }
  return merged
}

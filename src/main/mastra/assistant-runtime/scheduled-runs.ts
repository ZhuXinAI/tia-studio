import { randomUUID } from 'node:crypto'
import type { MessageInput } from '@mastra/core/agent/message-list'
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'
import { logger } from '../../utils/logger'

export function buildScheduledRunMessages(input: {
  kind: 'cron' | 'heartbeat'
  threadId: string
  prompt: string
  systemContext?: string | null
}): ReturnType<typeof toAISdkV5Messages> {
  logger.debug('[buildScheduledRunMessages] Input:', {
    kind: input.kind,
    prompt: input.prompt,
    promptLength: input.prompt?.length
  })

  const messages: MessageInput[] = []

  let userMessage = input.prompt
  if (input.kind === 'cron') {
    const now = new Date()
    const cronInstructions = `[CRON JOB EXECUTION - ${now.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' })}]

You are executing a SCHEDULED REMINDER that was already created. This is NOT a new request.

CRITICAL INSTRUCTIONS:
1. The user is NOT asking you to create a reminder - the reminder ALREADY EXISTS and is running NOW
2. DO NOT save anything to SOUL.md or MEMORY.md - this is just executing an existing reminder
3. DO NOT create new cron jobs - this reminder is already scheduled
4. You MUST call the sendMessageToChannel tool to deliver the reminder message
5. Keep the message simple and direct - just deliver the reminder

Example:
- Task: "提醒我：开会了。"
- Action: Call sendMessageToChannel({ message: "提醒：开会了。" })

DO NOT explain, DO NOT save to memory, DO NOT create tasks - JUST SEND THE REMINDER MESSAGE.

---
TASK TO EXECUTE NOW:
${input.prompt}`

    userMessage = cronInstructions
    logger.debug('[buildScheduledRunMessages] Prepended cron instructions to user message')
  }

  if (input.systemContext) {
    userMessage = `${input.systemContext}\n\n---\n${userMessage}`
  }

  logger.debug('[buildScheduledRunMessages] Adding user message, length:', userMessage.length)
  messages.push({
    id: `${input.kind}:${input.threadId}:${randomUUID()}`,
    role: 'user',
    content: userMessage,
    parts: [
      {
        type: 'text',
        text: userMessage
      }
    ]
  })

  logger.debug('[buildScheduledRunMessages] Messages before transformation:', messages.length)
  const transformed = toAISdkV5Messages(messages)
  logger.debug('[buildScheduledRunMessages] Messages after transformation:', transformed.length)

  return transformed
}

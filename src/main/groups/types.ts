export type GroupRunRequestedEvent = {
  runId: string
  groupThreadId: string
  profileId: string
  triggerMessageId: string
}

export type GroupMessageRequestedEvent = {
  eventId: string
  runId: string
  groupThreadId: string
  assistantId: string
  content: string
  mentions: string[]
  replyToMessageId?: string
}

export type GroupTurnPassedEvent = {
  eventId: string
  runId: string
  groupThreadId: string
  assistantId: string
  reason?: string
}

export type GroupEventMap = {
  'group.run.requested': GroupRunRequestedEvent
  'group.message.requested': GroupMessageRequestedEvent
  'group.turn.passed': GroupTurnPassedEvent
}

export type GroupEventName = keyof GroupEventMap

export type GroupEventHandler<TEventName extends GroupEventName> = (
  event: GroupEventMap[TEventName]
) => void | Promise<void>

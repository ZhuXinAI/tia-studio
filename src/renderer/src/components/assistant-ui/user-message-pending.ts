export function shouldShowUserMessagePending(input: {
  threadRunning: boolean
  isLastMessage: boolean
  nextMessageRole?: string
  nextMessageRunning?: boolean
}): boolean {
  if (!input.threadRunning) return false
  if (input.isLastMessage) return true
  return input.nextMessageRole === 'assistant' && input.nextMessageRunning === true
}

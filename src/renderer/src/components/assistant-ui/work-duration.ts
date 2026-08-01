export function resolveWorkDuration(input: {
  elapsed: number
  running: boolean
  storedDuration: number | undefined
}): number {
  if (input.running) return input.elapsed
  return input.storedDuration ?? 0
}

export function isWorkTraceActive(input: {
  messageRunning: boolean
  threadRunning: boolean
  isLastMessage: boolean
  waitingOnUser: boolean
}): boolean {
  return (
    !input.waitingOnUser && (input.messageRunning || (input.threadRunning && input.isLastMessage))
  )
}

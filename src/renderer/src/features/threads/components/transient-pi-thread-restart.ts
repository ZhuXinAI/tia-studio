export async function restartTransientSession(
  sessionId: string,
  close: (sessionId: string) => Promise<void>,
  clear: () => void
): Promise<void> {
  await close(sessionId)
  clear()
}

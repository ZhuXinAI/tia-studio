export function resolveWorkDuration(input: {
  elapsed: number
  running: boolean
  storedDuration: number | undefined
}): number {
  if (input.running) return input.elapsed
  return input.storedDuration ?? 0
}

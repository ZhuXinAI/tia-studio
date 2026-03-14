export type ThreadSlashCommand = 'new' | 'stop'

export function parseThreadSlashCommand(input: string): ThreadSlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return null
  }

  const [rawCommand] = trimmed.slice(1).split(/\s+/, 1)
  if (!rawCommand) {
    return null
  }

  const normalizedCommand = rawCommand.toLowerCase()
  if (normalizedCommand === 'new' || normalizedCommand === 'stop') {
    return normalizedCommand
  }

  return null
}

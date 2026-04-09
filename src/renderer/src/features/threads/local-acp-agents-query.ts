export type InstalledLocalAcpAgentRecord = {
  key: 'codex' | 'claude' | 'gemini' | 'qwen-code' | 'openclaw'
  label: string
  resolvedCommand: string
  binaryPath: string
}

function requireDesktopMethod<Key extends keyof NonNullable<typeof window.tiaDesktop>>(
  key: Key
): NonNullable<NonNullable<typeof window.tiaDesktop>[Key]> {
  const method = window.tiaDesktop?.[key]
  if (!method) {
    throw new Error(`Desktop bridge method "${String(key)}" is unavailable`)
  }

  return method as NonNullable<NonNullable<typeof window.tiaDesktop>[Key]>
}

export async function listInstalledLocalAcpAgents(): Promise<InstalledLocalAcpAgentRecord[]> {
  return requireDesktopMethod('listInstalledLocalAcpAgents')()
}

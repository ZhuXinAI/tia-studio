function requireDesktopMethod<Key extends keyof NonNullable<typeof window.tiaDesktop>>(
  key: Key
): NonNullable<NonNullable<typeof window.tiaDesktop>[Key]> {
  const method = window.tiaDesktop?.[key]
  if (!method) {
    throw new Error(`Desktop bridge method "${String(key)}" is unavailable`)
  }

  return method as NonNullable<NonNullable<typeof window.tiaDesktop>[Key]>
}

export async function resolveDefaultAssistantWorkspacePath(
  assistantName: string
): Promise<string> {
  return requireDesktopMethod('resolveDefaultAssistantWorkspacePath')(assistantName)
}

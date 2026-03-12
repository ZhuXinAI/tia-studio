export type CodexCliStatus = {
  available: boolean
  version: string | null
  errorMessage: string | null
}

export async function getCodexCliStatus(): Promise<CodexCliStatus> {
  const method = window.tiaDesktop?.getCodexCliStatus
  if (!method) {
    return {
      available: false,
      version: null,
      errorMessage: 'Desktop bridge method "getCodexCliStatus" is unavailable.'
    }
  }

  return method()
}

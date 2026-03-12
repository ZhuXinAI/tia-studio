export type DesktopAppInfo = {
  name: string
  version: string
}

const fallbackDesktopAppInfo: DesktopAppInfo = {
  name: 'TIA Studio',
  version: '0.0.0'
}

function toDisplayVersion(rawVersion: string): string {
  const normalized = rawVersion.trim()
  if (normalized.length === 0) {
    return fallbackDesktopAppInfo.version
  }

  return normalized
}

export async function getDesktopAppInfo(): Promise<DesktopAppInfo> {
  const getAppInfo = window.tiaDesktop?.getAppInfo
  if (!getAppInfo) {
    return fallbackDesktopAppInfo
  }

  try {
    const appInfo = await getAppInfo()
    return {
      name: 'TIA Studio',
      version: toDisplayVersion(appInfo.version)
    }
  } catch {
    return fallbackDesktopAppInfo
  }
}

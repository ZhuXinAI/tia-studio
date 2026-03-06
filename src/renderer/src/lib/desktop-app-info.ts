export type DesktopAppInfo = {
  name: string
  version: string
}

const fallbackDesktopAppInfo: DesktopAppInfo = {
  name: 'TIA Studio',
  version: '0.0.0'
}

function toDisplayName(rawName: string): string {
  const normalized = rawName.trim()
  if (normalized.length === 0) {
    return fallbackDesktopAppInfo.name
  }

  if (/[A-Z\s]/.test(normalized)) {
    return normalized
  }

  return normalized
    .split(/[-_]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
      name: toDisplayName(appInfo.name),
      version: toDisplayVersion(appInfo.version)
    }
  } catch {
    return fallbackDesktopAppInfo
  }
}

export type AppMode = 'chat' | 'team'

const appModeStorageKey = 'tia.app.last-mode'

export function readStoredAppMode(): AppMode | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(appModeStorageKey)
  if (!storedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(storedValue) as {
      mode?: unknown
    }

    if (parsed.mode === 'chat' || parsed.mode === 'team') {
      return parsed.mode
    }

    return null
  } catch {
    return null
  }
}

export function storeAppMode(mode: AppMode): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(appModeStorageKey, JSON.stringify({ mode }))
}

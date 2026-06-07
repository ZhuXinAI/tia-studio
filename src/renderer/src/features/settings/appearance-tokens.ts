export type AppearanceTokens = {
  accentColor: string
  backgroundColor: string
  foregroundColor: string
}

const appearanceTokenStorageKey = 'tia.appearance.tokens.v2'
const appearanceTokenStyleProperties = [
  '--primary',
  '--accent-contrast',
  '--surface-canvas',
  '--background',
  '--foreground',
  '--card-foreground',
  '--popover-foreground'
] as const

export const defaultAppearanceTokens: AppearanceTokens = {
  accentColor: '#fafafa',
  backgroundColor: '#09090b',
  foregroundColor: '#fafafa'
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

export function normalizeAppearanceTokens(value: unknown): AppearanceTokens {
  if (typeof value !== 'object' || value === null) {
    return defaultAppearanceTokens
  }

  const input = value as Record<string, unknown>
  return {
    accentColor: isHexColor(input.accentColor)
      ? input.accentColor.trim()
      : defaultAppearanceTokens.accentColor,
    backgroundColor: isHexColor(input.backgroundColor)
      ? input.backgroundColor.trim()
      : defaultAppearanceTokens.backgroundColor,
    foregroundColor: isHexColor(input.foregroundColor)
      ? input.foregroundColor.trim()
      : defaultAppearanceTokens.foregroundColor
  }
}

export function getAppearanceTokens(): AppearanceTokens {
  const storedTokens = getStoredAppearanceTokens()
  if (storedTokens) {
    return storedTokens
  }

  if (typeof document !== 'undefined') {
    const rootStyles = getComputedStyle(document.documentElement)
    const accentColor = rootStyles.getPropertyValue('--primary').trim()
    const backgroundColor = rootStyles.getPropertyValue('--surface-canvas').trim()
    const foregroundColor = rootStyles.getPropertyValue('--foreground').trim()

    return normalizeAppearanceTokens({
      accentColor,
      backgroundColor,
      foregroundColor
    })
  }

  return defaultAppearanceTokens
}

export function getStoredAppearanceTokens(): AppearanceTokens | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(appearanceTokenStorageKey)
  if (!storedValue) {
    return null
  }

  try {
    return normalizeAppearanceTokens(JSON.parse(storedValue))
  } catch {
    return null
  }
}

export function applyAppearanceTokens(tokens: AppearanceTokens): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.style.setProperty('--primary', tokens.accentColor)
  root.style.setProperty('--accent-contrast', tokens.accentColor)
  root.style.setProperty('--surface-canvas', tokens.backgroundColor)
  root.style.setProperty('--background', tokens.backgroundColor)
  root.style.setProperty('--foreground', tokens.foregroundColor)
  root.style.setProperty('--card-foreground', tokens.foregroundColor)
  root.style.setProperty('--popover-foreground', tokens.foregroundColor)
}

export function clearAppearanceTokenOverrides(): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  appearanceTokenStyleProperties.forEach((property) => {
    root.style.removeProperty(property)
  })
}

export function setAppearanceTokens(tokens: AppearanceTokens): AppearanceTokens {
  const normalizedTokens = normalizeAppearanceTokens(tokens)
  window.localStorage.setItem(appearanceTokenStorageKey, JSON.stringify(normalizedTokens))
  applyAppearanceTokens(normalizedTokens)
  return normalizedTokens
}

export function resetAppearanceTokens(): AppearanceTokens {
  window.localStorage.removeItem(appearanceTokenStorageKey)
  clearAppearanceTokenOverrides()
  return getAppearanceTokens()
}

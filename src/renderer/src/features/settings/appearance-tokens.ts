export type AppearanceTokens = {
  accentColor: string
  backgroundColor: string
  foregroundColor: string
}

const appearanceTokenStorageKey = 'tia.appearance.tokens'

export const mineralAppearanceTokens: AppearanceTokens = {
  accentColor: '#9d7442',
  backgroundColor: '#181818',
  foregroundColor: '#f4efe8'
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

export function normalizeAppearanceTokens(value: unknown): AppearanceTokens {
  if (typeof value !== 'object' || value === null) {
    return mineralAppearanceTokens
  }

  const input = value as Record<string, unknown>
  return {
    accentColor: isHexColor(input.accentColor)
      ? input.accentColor.trim()
      : mineralAppearanceTokens.accentColor,
    backgroundColor: isHexColor(input.backgroundColor)
      ? input.backgroundColor.trim()
      : mineralAppearanceTokens.backgroundColor,
    foregroundColor: isHexColor(input.foregroundColor)
      ? input.foregroundColor.trim()
      : mineralAppearanceTokens.foregroundColor
  }
}

export function getAppearanceTokens(): AppearanceTokens {
  if (typeof window === 'undefined') {
    return mineralAppearanceTokens
  }

  const storedValue = window.localStorage.getItem(appearanceTokenStorageKey)
  if (!storedValue) {
    return mineralAppearanceTokens
  }

  try {
    return normalizeAppearanceTokens(JSON.parse(storedValue))
  } catch {
    return mineralAppearanceTokens
  }
}

export function applyAppearanceTokens(tokens: AppearanceTokens): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.style.setProperty('--primary', tokens.accentColor)
  root.style.setProperty('--accent-brass', tokens.accentColor)
  root.style.setProperty('--surface-canvas', tokens.backgroundColor)
  root.style.setProperty('--background', tokens.backgroundColor)
  root.style.setProperty('--foreground', tokens.foregroundColor)
  root.style.setProperty('--card-foreground', tokens.foregroundColor)
  root.style.setProperty('--popover-foreground', tokens.foregroundColor)
}

export function setAppearanceTokens(tokens: AppearanceTokens): AppearanceTokens {
  const normalizedTokens = normalizeAppearanceTokens(tokens)
  window.localStorage.setItem(appearanceTokenStorageKey, JSON.stringify(normalizedTokens))
  applyAppearanceTokens(normalizedTokens)
  return normalizedTokens
}

export function resetAppearanceTokens(): AppearanceTokens {
  window.localStorage.removeItem(appearanceTokenStorageKey)
  applyAppearanceTokens(mineralAppearanceTokens)
  return mineralAppearanceTokens
}

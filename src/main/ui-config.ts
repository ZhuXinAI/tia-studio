import { readFileSync as readFileSyncFromFs, writeFileSync as writeFileSyncFromFs } from 'node:fs'

export const supportedUiLanguages = [
  'zh-CN',
  'zh-HK',
  'en-US',
  'de-DE',
  'ja-JP',
  'ru-RU',
  'el-GR',
  'es-ES',
  'fr-FR',
  'pt-PT',
  'ro-RO'
] as const

export type UiLanguage = (typeof supportedUiLanguages)[number]

export type UiConfig = {
  transparent?: boolean
  language?: UiLanguage | null
}

type UiConfigStoreOptions = {
  filePath: string
  readFile?: (path: string, encoding: 'utf8') => string
  writeFile?: (path: string, data: string, encoding: 'utf8') => void
}

function normalizeUiLanguage(value: unknown): UiLanguage | null | undefined {
  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalizedValue = value.trim().toLowerCase()
  return (
    supportedUiLanguages.find((language) => language.toLowerCase() === normalizedValue) ?? undefined
  )
}

export function normalizeUiConfig(value: unknown): UiConfig {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const input = value as Record<string, unknown>
  const normalizedConfig: UiConfig = {}

  if (Object.hasOwn(input, 'transparent') && typeof input.transparent === 'boolean') {
    normalizedConfig.transparent = input.transparent
  }

  if (Object.hasOwn(input, 'language')) {
    const language = normalizeUiLanguage(input.language)
    if (language !== undefined) {
      normalizedConfig.language = language
    }
  }

  return normalizedConfig
}

export class UiConfigStore {
  private readonly filePath: string
  private readonly readFile: (path: string, encoding: 'utf8') => string
  private readonly writeFile: (path: string, data: string, encoding: 'utf8') => void

  constructor(options: UiConfigStoreOptions) {
    this.filePath = options.filePath
    this.readFile = options.readFile ?? readFileSyncFromFs
    this.writeFile = options.writeFile ?? writeFileSyncFromFs
  }

  getConfig(): UiConfig {
    try {
      const rawValue = this.readFile(this.filePath, 'utf8')
      return normalizeUiConfig(JSON.parse(rawValue))
    } catch {
      return {}
    }
  }

  updateConfig(partialConfig: UiConfig): UiConfig {
    const currentConfig = this.getConfig()
    const normalizedPartial = normalizeUiConfig(partialConfig)
    const nextConfig: UiConfig = { ...currentConfig }

    if (Object.hasOwn(normalizedPartial, 'transparent')) {
      nextConfig.transparent = normalizedPartial.transparent
    }

    if (Object.hasOwn(normalizedPartial, 'language')) {
      nextConfig.language = normalizedPartial.language
    }

    const normalizedNextConfig = normalizeUiConfig(nextConfig)
    this.writeFile(this.filePath, JSON.stringify(normalizedNextConfig, null, 2), 'utf8')
    return normalizedNextConfig
  }
}

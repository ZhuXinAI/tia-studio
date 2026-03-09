export const supportedLocales = [
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

export type SupportedLocale = (typeof supportedLocales)[number]

export type LocaleOption = {
  code: SupportedLocale
  label: string
  englishLabel: string
  flag: string
}

export const fallbackLocale: SupportedLocale = 'en-US'

const localeOptionByCode: Record<SupportedLocale, LocaleOption> = {
  'zh-CN': {
    code: 'zh-CN',
    label: '中文',
    englishLabel: 'Chinese (Simplified)',
    flag: '🇨🇳'
  },
  'zh-HK': {
    code: 'zh-HK',
    label: '中文（繁體）',
    englishLabel: 'Chinese (Traditional)',
    flag: '🇭🇰'
  },
  'en-US': {
    code: 'en-US',
    label: 'English',
    englishLabel: 'English',
    flag: '🇺🇸'
  },
  'de-DE': {
    code: 'de-DE',
    label: 'Deutsch',
    englishLabel: 'German',
    flag: '🇩🇪'
  },
  'ja-JP': {
    code: 'ja-JP',
    label: '日本語',
    englishLabel: 'Japanese',
    flag: '🇯🇵'
  },
  'ru-RU': {
    code: 'ru-RU',
    label: 'Русский',
    englishLabel: 'Russian',
    flag: '🇷🇺'
  },
  'el-GR': {
    code: 'el-GR',
    label: 'Ελληνικά',
    englishLabel: 'Greek',
    flag: '🇬🇷'
  },
  'es-ES': {
    code: 'es-ES',
    label: 'Español',
    englishLabel: 'Spanish',
    flag: '🇪🇸'
  },
  'fr-FR': {
    code: 'fr-FR',
    label: 'Français',
    englishLabel: 'French',
    flag: '🇫🇷'
  },
  'pt-PT': {
    code: 'pt-PT',
    label: 'Português',
    englishLabel: 'Portuguese',
    flag: '🇵🇹'
  },
  'ro-RO': {
    code: 'ro-RO',
    label: 'Română',
    englishLabel: 'Romanian',
    flag: '🇷🇴'
  }
}

export const localeOptions = supportedLocales.map((code) => localeOptionByCode[code])

function canonicalizeLocaleTag(rawLocale: string): string {
  const normalizedValue = rawLocale.trim().replaceAll('_', '-')

  if (!normalizedValue) {
    return ''
  }

  try {
    return new Intl.Locale(normalizedValue).baseName
  } catch {
    const [language = '', ...rest] = normalizedValue.split('-')

    if (!language) {
      return ''
    }

    const normalizedParts = [language.toLowerCase()]

    for (const segment of rest) {
      if (segment.length === 2 || segment.length === 3) {
        normalizedParts.push(segment.toUpperCase())
        continue
      }

      if (segment.length === 4) {
        normalizedParts.push(segment[0].toUpperCase() + segment.slice(1).toLowerCase())
        continue
      }

      normalizedParts.push(segment.toLowerCase())
    }

    return normalizedParts.join('-')
  }
}

function normalizeSupportedLocale(rawLocale: string | null | undefined): SupportedLocale | null {
  if (!rawLocale) {
    return null
  }

  const canonicalValue = canonicalizeLocaleTag(rawLocale)
  return (
    supportedLocales.find((locale) => locale.toLowerCase() === canonicalValue.toLowerCase()) ?? null
  )
}

export function isSupportedLocale(
  rawLocale: string | null | undefined
): rawLocale is SupportedLocale {
  return normalizeSupportedLocale(rawLocale) !== null
}

export function resolveSupportedLocale(rawLocale: string | null | undefined): SupportedLocale {
  const directMatch = normalizeSupportedLocale(rawLocale)

  if (directMatch) {
    return directMatch
  }

  const canonicalValue = rawLocale ? canonicalizeLocaleTag(rawLocale) : ''

  if (!canonicalValue) {
    return fallbackLocale
  }

  try {
    const locale = new Intl.Locale(canonicalValue)
    const language = locale.language.toLowerCase()
    const script = locale.script?.toLowerCase()
    const region = locale.region?.toUpperCase()

    if (language === 'zh') {
      if (script === 'hant' || region === 'TW' || region === 'HK' || region === 'MO') {
        return 'zh-HK'
      }

      return 'zh-CN'
    }

    switch (language) {
      case 'en':
        return 'en-US'
      case 'de':
        return 'de-DE'
      case 'ja':
        return 'ja-JP'
      case 'ru':
        return 'ru-RU'
      case 'el':
        return 'el-GR'
      case 'es':
        return 'es-ES'
      case 'fr':
        return 'fr-FR'
      case 'pt':
        return 'pt-PT'
      case 'ro':
        return 'ro-RO'
      default:
        return fallbackLocale
    }
  } catch {
    return fallbackLocale
  }
}

export function resolveEffectiveLocale(
  languageOverride: string | null | undefined,
  systemLocale: string | null | undefined
): SupportedLocale {
  const explicitOverride = normalizeSupportedLocale(languageOverride)

  if (explicitOverride) {
    return explicitOverride
  }

  return resolveSupportedLocale(systemLocale)
}

export function getLocaleOptionLabel(locale: SupportedLocale): string {
  return localeOptionByCode[locale].label
}

export function getLocaleOption(locale: SupportedLocale): LocaleOption {
  return localeOptionByCode[locale]
}

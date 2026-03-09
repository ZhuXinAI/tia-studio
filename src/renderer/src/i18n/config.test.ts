import { describe, expect, it } from 'vitest'
import {
  fallbackLocale,
  getLocaleOptionLabel,
  isSupportedLocale,
  localeOptions,
  resolveEffectiveLocale,
  resolveSupportedLocale,
  supportedLocales
} from './config'

describe('i18n locale config', () => {
  it('defines metadata for every supported locale', () => {
    expect(supportedLocales).toEqual([
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
    ])
    expect(localeOptions).toHaveLength(supportedLocales.length)
    expect(localeOptions.map((option) => option.code)).toEqual(supportedLocales)
  })

  it('checks whether a locale is directly supported', () => {
    expect(isSupportedLocale('en-US')).toBe(true)
    expect(isSupportedLocale('it-IT')).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
  })

  it('maps english regional variants to en-US', () => {
    expect(resolveSupportedLocale('en-GB')).toBe('en-US')
  })

  it('maps simplified and traditional Chinese variants to supported locales', () => {
    expect(resolveSupportedLocale('zh-TW')).toBe('zh-HK')
    expect(resolveSupportedLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(resolveSupportedLocale('zh-Hant-HK')).toBe('zh-HK')
  })

  it('falls back to en-US for unsupported locales', () => {
    expect(resolveSupportedLocale('it-IT')).toBe(fallbackLocale)
    expect(resolveSupportedLocale(null)).toBe(fallbackLocale)
  })

  it('prefers an explicit supported override over the system locale', () => {
    expect(resolveEffectiveLocale('fr-FR', 'ja-JP')).toBe('fr-FR')
  })

  it('ignores an unsupported override and falls back to the system locale', () => {
    expect(resolveEffectiveLocale('it-IT', 'ja-JP')).toBe('ja-JP')
  })

  it('returns the native label for each locale', () => {
    expect(getLocaleOptionLabel('zh-CN')).toBe('中文')
    expect(getLocaleOptionLabel('zh-HK')).toBe('中文（繁體）')
    expect(getLocaleOptionLabel('el-GR')).toBe('Ελληνικά')
    expect(getLocaleOptionLabel('ro-RO')).toBe('Română')
  })
})

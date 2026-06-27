import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { getSystemLocale, getUiConfig, setUiConfig } from '../ui-config'
import {
  getLocaleOptionLabel,
  isSupportedLocale,
  localeOptions,
  resolveEffectiveLocale,
  type SupportedLocale
} from '../../../i18n/config'
import { i18n } from '../../../i18n'
import { SettingsContent } from './settings-content'

const systemLanguageValue = 'system'

type LanguagePreference = SupportedLocale | typeof systemLanguageValue
const generalSelectClassName =
  'h-11 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-2 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]'

export function GeneralSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedLanguage, setSelectedLanguage] = useState<LanguagePreference>(systemLanguageValue)
  const [effectiveLocale, setEffectiveLocale] = useState<SupportedLocale>('en-US')

  useEffect(() => {
    let isMounted = true

    void Promise.all([getUiConfig(), getSystemLocale()]).then(([uiConfig, systemLocale]) => {
      if (!isMounted) {
        return
      }

      setSelectedLanguage(
        uiConfig.language && isSupportedLocale(uiConfig.language)
          ? uiConfig.language
          : systemLanguageValue
      )
      setEffectiveLocale(resolveEffectiveLocale(uiConfig.language, systemLocale))
    })

    return () => {
      isMounted = false
    }
  }, [])

  const effectiveLanguageLabel = useMemo(() => {
    return getLocaleOptionLabel(effectiveLocale)
  }, [effectiveLocale])

  const handleLanguageChange = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ): Promise<void> => {
    const nextValue = event.target.value as LanguagePreference
    const nextLanguage = nextValue === systemLanguageValue ? null : nextValue
    const systemLocale = await getSystemLocale()
    const nextEffectiveLocale = resolveEffectiveLocale(nextLanguage, systemLocale)

    setSelectedLanguage(nextValue)
    setEffectiveLocale(nextEffectiveLocale)
    await setUiConfig({ language: nextLanguage })
    await i18n.changeLanguage(nextEffectiveLocale)
  }

  return (
    <SettingsContent>
      <header className="border-b border-[color:var(--surface-border)] pb-5">
        <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">
          {t('settings.general.title')}
        </h1>
      </header>

      <section className="space-y-4 rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] p-6 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_42%,transparent)]">
        <label htmlFor="general-language-select" className="sr-only">
          {t('settings.general.languageLabel')}
        </label>
        <select
          id="general-language-select"
          aria-label="Language"
          className={generalSelectClassName}
          value={selectedLanguage}
          onChange={(event) => {
            void handleLanguageChange(event)
          }}
        >
          <option value={systemLanguageValue}>{t('settings.general.systemDefault')}</option>
          {localeOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.flag} {option.label}
            </option>
          ))}
        </select>

        <p className="text-sm text-muted-foreground">
          {t('settings.general.currentSystemLanguage', {
            language: effectiveLanguageLabel
          })}
        </p>
      </section>
    </SettingsContent>
  )
}

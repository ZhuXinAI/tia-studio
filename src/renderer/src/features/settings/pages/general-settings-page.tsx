import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { getSystemLocale, getUiConfig, setUiConfig } from '../ui-config'
import {
  getLocaleOptionLabel,
  isSupportedLocale,
  localeOptions,
  resolveEffectiveLocale,
  type SupportedLocale
} from '../../../i18n/config'
import { i18n } from '../../../i18n'

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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-8">
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">Locale and language</p>
        <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">
          {t('settings.general.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('settings.general.description')}</p>
      </header>

      <Card className="border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_78%,transparent))]">
        <CardHeader>
          <p className="section-kicker">Display language</p>
          <CardTitle className="font-editorial text-[1.9rem] leading-none tracking-[-0.03em]">
            {t('settings.general.languageLabel')}
          </CardTitle>
          <CardDescription>{t('settings.general.languageDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] p-5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
            <div className="space-y-1">
              <p className="section-kicker text-[0.66rem]">Preference</p>
              <h3 className="font-editorial text-[1.35rem] leading-none tracking-[-0.025em]">
                {t('settings.general.languageLabel')}
              </h3>
              <p className="text-sm text-muted-foreground">{t('settings.general.languageDescription')}</p>
            </div>

            <select
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

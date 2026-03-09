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
    <div className="py-4 flex flex-col gap-4 space-y-6">
      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>{t('settings.general.title')}</CardTitle>
          <CardDescription>{t('settings.general.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">{t('settings.general.languageLabel')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.languageDescription')}
              </p>
            </div>

            <select
              aria-label="Language"
              className="border-input bg-background h-10 w-full rounded-md border px-3 py-2 text-sm"
              value={selectedLanguage}
              onChange={(event) => {
                void handleLanguageChange(event)
              }}
            >
              <option value={systemLanguageValue}>
                {t('settings.general.systemDefault')}
              </option>
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

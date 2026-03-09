import { useEffect, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { useTheme, type Theme } from '../../../components/theme-provider'
import { Moon, Sun, Monitor, type LucideIcon } from 'lucide-react'
import { getUiConfig, setUiConfig } from '../ui-config'

export function DisplaySettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [isTransparent, setIsTransparent] = useState(false)
  const themeOptions: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
    { value: 'light', label: t('settings.display.themeOptions.light'), icon: Sun },
    { value: 'dark', label: t('settings.display.themeOptions.dark'), icon: Moon },
    { value: 'system', label: t('settings.display.themeOptions.system'), icon: Monitor }
  ]

  useEffect(() => {
    let isMounted = true

    void getUiConfig()
      .then((config) => {
        if (!isMounted) {
          return
        }

        setIsTransparent(Boolean(config.transparent))
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  const toggleTransparent = async (): Promise<void> => {
    const newValue = !isTransparent
    setIsTransparent(newValue)
    await setUiConfig({ transparent: newValue })
      .catch(() => {
        setIsTransparent(!newValue)
      })
  }

  return (
    <div className="py-4 flex flex-col gap-4 space-y-6">
      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>{t('settings.display.title')}</CardTitle>
          <CardDescription>{t('settings.display.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">{t('settings.display.themeLabel')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex flex-col items-center justify-between rounded-md border-2 p-4 transition-all gap-2 cursor-pointer 
                    ${theme === value ? 'border-primary text-primary bg-accent/50' : 'border-muted bg-popover hover:bg-accent hover:text-accent-foreground'}
                  `}
                >
                  <Icon className="size-6 mb-2" />
                  <span className="font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-sm font-medium">{t('settings.display.transparentTitle')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings.display.transparentDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTransparent}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isTransparent ? 'bg-primary' : 'bg-input'}`}
              >
                <span
                  className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${isTransparent ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

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
import { cn } from '../../../lib/utils'

function ThemePreview({ theme }: { theme: Theme }): React.JSX.Element {
  if (theme === 'light') {
    return (
      <div className="rounded-[1.15rem] border border-slate-200 bg-white p-3 text-slate-900 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5 text-slate-300">
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-20 rounded-full bg-slate-900/75" />
          <div className="grid gap-2">
            <div className="h-10 rounded-xl bg-slate-100" />
            <div className="grid grid-cols-[1.35fr_0.65fr] gap-2">
              <div className="h-8 rounded-lg bg-slate-100" />
              <div className="h-8 rounded-lg bg-blue-100" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (theme === 'dark') {
    return (
      <div className="rounded-[1.15rem] border border-white/10 bg-[#161a22] p-3 text-slate-100 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5 text-white/15">
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-20 rounded-full bg-white/75" />
          <div className="grid gap-2">
            <div className="h-10 rounded-xl bg-white/6" />
            <div className="grid grid-cols-[1.35fr_0.65fr] gap-2">
              <div className="h-8 rounded-lg bg-white/6" />
              <div className="h-8 rounded-lg bg-blue-500/18" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-[1.15rem] border border-slate-200 bg-white p-3 text-slate-900 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5 text-slate-300">
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
        </div>
        <div className="h-3 w-16 rounded-full bg-slate-900/70" />
      </div>
      <div className="rounded-[1.15rem] border border-white/10 bg-[#161a22] p-3 text-slate-100 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5 text-white/15">
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="h-2 w-2 rounded-full bg-current" />
        </div>
        <div className="h-3 w-16 rounded-full bg-white/70" />
      </div>
    </div>
  )
}

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
    await setUiConfig({ transparent: newValue }).catch(() => {
      setIsTransparent(!newValue)
    })
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-6">
      <Card className="border-border/70 bg-[color:var(--surface-panel)] shadow-none">
        <CardHeader className="pb-0">
          <CardTitle className="tracking-[-0.02em]">{t('settings.display.title')}</CardTitle>
          <CardDescription className="max-w-2xl">
            {t('settings.display.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 py-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">{t('settings.display.themeLabel')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex cursor-pointer flex-col gap-4 rounded-[1.25rem] border p-4 text-left transition-[background-color,border-color,box-shadow,color]',
                    theme === value
                      ? 'border-primary bg-[color:var(--surface-active)] text-foreground shadow-[0_0_0_1px_var(--surface-active-strong)]'
                      : 'border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] hover:bg-[color:var(--surface-muted)]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-5" />
                    <span className="font-semibold">{label}</span>
                  </div>
                  <ThemePreview theme={value} />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-5">
            <div className="flex items-center justify-between gap-4">
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

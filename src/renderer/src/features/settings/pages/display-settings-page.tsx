import { useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { useTheme, type Theme } from '../../../components/theme-provider'
import { Moon, Sun, Monitor, RotateCcw, type LucideIcon } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Button } from '../../../components/ui/button'
import {
  getAppearanceTokens,
  resetAppearanceTokens,
  setAppearanceTokens,
  type AppearanceTokens
} from '../appearance-tokens'
import { SettingsContent } from './settings-content'

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
  const [appearanceTokens, setAppearanceTokensState] = useState<AppearanceTokens>(() =>
    getAppearanceTokens()
  )
  const themeOptions: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
    { value: 'light', label: t('settings.display.themeOptions.light'), icon: Sun },
    { value: 'dark', label: t('settings.display.themeOptions.dark'), icon: Moon },
    { value: 'system', label: t('settings.display.themeOptions.system'), icon: Monitor }
  ]

  const updateAppearanceToken = (key: keyof AppearanceTokens, value: string): void => {
    const nextTokens = setAppearanceTokens({
      ...appearanceTokens,
      [key]: value
    })
    setAppearanceTokensState(nextTokens)
  }

  const handleResetAppearanceTokens = (): void => {
    setAppearanceTokensState(resetAppearanceTokens())
  }

  return (
    <SettingsContent>
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">Theme and appearance</p>
        <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">
          {t('settings.display.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t('settings.display.description')}
        </p>
      </header>

      <Card className="border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_78%,transparent))] shadow-none">
        <CardHeader className="pb-0">
          <p className="section-kicker">Appearance</p>
          <CardTitle className="font-editorial text-[1.9rem] leading-none tracking-[-0.03em]">
            {t('settings.display.themeLabel')}
          </CardTitle>
          <CardDescription className="max-w-2xl">
            {t('settings.display.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 py-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
          <div className="space-y-4">
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

          <div className="space-y-4 rounded-[1.25rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-5">
            <div className="space-y-1">
              <p className="section-kicker text-[0.66rem]">Appearance Tokens</p>
              <h3 className="text-sm font-medium">Neutral tuning</h3>
              <p className="text-sm text-muted-foreground">
                Adjust the accent, background, and foreground colors while keeping the neutral
                visual system intact.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                ['accentColor', 'Accent'],
                ['backgroundColor', 'Background'],
                ['foregroundColor', 'Foreground']
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={appearanceTokens[key as keyof AppearanceTokens]}
                      onChange={(event) =>
                        updateAppearanceToken(key as keyof AppearanceTokens, event.target.value)
                      }
                      className="size-9 cursor-pointer rounded-md border border-[color:var(--surface-border)] bg-transparent p-1"
                      aria-label={`${label} color`}
                    />
                    <code className="w-20 rounded-md bg-[color:var(--surface-muted)] px-2 py-1 text-[11px]">
                      {appearanceTokens[key as keyof AppearanceTokens]}
                    </code>
                  </span>
                </label>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={handleResetAppearanceTokens}>
              <RotateCcw className="size-4" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>
    </SettingsContent>
  )
}

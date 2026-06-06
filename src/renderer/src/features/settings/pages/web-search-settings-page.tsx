import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { Switch } from '../../../components/ui/switch'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  getWebSearchSettings,
  updateWebSearchSettings,
  type WebSearchSettings
} from '../web-search/web-search-query'

type SettingsSwitchRowProps = {
  title: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}

function SettingsSwitchRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange
}: SettingsSwitchRowProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
      <div className="space-y-1 flex-1">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function WebSearchSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<WebSearchSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingKeepBrowserWindowOpen, setIsSavingKeepBrowserWindowOpen] = useState(false)
  const [isSavingShowBrowser, setIsSavingShowBrowser] = useState(false)

  const toErrorMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof Error) {
        const message = error.message.trim()
        if (message.length > 0) {
          return message
        }
      }

      return t('settings.webSearch.toasts.unexpectedError')
    },
    [t]
  )

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      setSettings(await getWebSearchSettings())
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [toErrorMessage])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const isSavingAnySetting = isSavingKeepBrowserWindowOpen || isSavingShowBrowser

  const setKeepBrowserWindowOpen = async (keepBrowserWindowOpen: boolean): Promise<void> => {
    if (!settings || settings.keepBrowserWindowOpen === keepBrowserWindowOpen) {
      return
    }

    setIsSavingKeepBrowserWindowOpen(true)
    try {
      const nextSettings = await updateWebSearchSettings({
        keepBrowserWindowOpen
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.keepFetchWindowOpen', {
          state: keepBrowserWindowOpen
            ? t('settings.webSearch.toasts.keepFetchWindowOpenEnabled')
            : t('settings.webSearch.toasts.keepFetchWindowOpenDisabled')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSavingKeepBrowserWindowOpen(false)
    }
  }

  const setShowBrowser = async (showBrowser: boolean): Promise<void> => {
    if (!settings || settings.showBrowser === showBrowser) {
      return
    }

    setIsSavingShowBrowser(true)
    try {
      const nextSettings = await updateWebSearchSettings({
        showBrowser
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.fetchWindowVisibility', {
          state: showBrowser
            ? t('settings.webSearch.toasts.windowVisible')
            : t('settings.webSearch.toasts.windowHidden')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSavingShowBrowser(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">External tool browsing</p>
        <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">
          {t('settings.webSearch.title')}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('settings.webSearch.description')}</p>
      </header>

      <Card className="border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_78%,transparent))]">
        <CardHeader className="pb-3">
          <p className="section-kicker">Mode</p>
          <CardTitle className="font-editorial text-[1.7rem] leading-none tracking-[-0.03em]">
            {t('settings.webSearch.browserAutomation.title')}
          </CardTitle>
          <CardDescription>{t('settings.webSearch.browserAutomation.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? t('settings.webSearch.browserAutomation.loading')
              : t('settings.webSearch.browserAutomation.modeExternalToolsDescription')}
          </p>
        </CardContent>
      </Card>

      <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
        <CardHeader className="pb-3">
          <p className="section-kicker">Fetch window</p>
          <CardTitle className="font-editorial text-[1.7rem] leading-none tracking-[-0.03em]">
            {t('settings.webSearch.fetchWindow.title')}
          </CardTitle>
          <CardDescription>{t('settings.webSearch.fetchWindow.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t('settings.webSearch.fetchWindow.loading')}
            </p>
          ) : (
            <>
              <SettingsSwitchRow
                title={t('settings.webSearch.fetchWindow.keepOpenTitle')}
                description={
                  settings?.keepBrowserWindowOpen
                    ? t('settings.webSearch.fetchWindow.keepOpenEnabled')
                    : t('settings.webSearch.fetchWindow.keepOpenDisabled')
                }
                checked={settings?.keepBrowserWindowOpen ?? true}
                disabled={!settings || isSavingAnySetting}
                onCheckedChange={(checked) => {
                  void setKeepBrowserWindowOpen(checked)
                }}
              />
              <SettingsSwitchRow
                title={t('settings.webSearch.fetchWindow.showTitle')}
                description={
                  settings?.showBrowser
                    ? t('settings.webSearch.fetchWindow.showVisible')
                    : t('settings.webSearch.fetchWindow.showHidden')
                }
                checked={settings?.showBrowser ?? false}
                disabled={!settings || isSavingAnySetting}
                onCheckedChange={(checked) => {
                  void setShowBrowser(checked)
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

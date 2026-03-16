import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
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
  type BrowserAutomationMode,
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
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3">
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
  const [savingBrowserAutomationMode, setSavingBrowserAutomationMode] =
    useState<BrowserAutomationMode | null>(null)
  const [isSavingKeepBrowserWindowOpen, setIsSavingKeepBrowserWindowOpen] = useState(false)
  const [isSavingShowBrowser, setIsSavingShowBrowser] = useState(false)
  const [isSavingShowBuiltInBrowser, setIsSavingShowBuiltInBrowser] = useState(false)
  const [isSavingShowTiaBrowserTool, setIsSavingShowTiaBrowserTool] = useState(false)

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

  const isSavingAnySetting =
    Boolean(savingBrowserAutomationMode) ||
    isSavingKeepBrowserWindowOpen ||
    isSavingShowBrowser ||
    isSavingShowBuiltInBrowser ||
    isSavingShowTiaBrowserTool

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

  const setShowBuiltInBrowser = async (showBuiltInBrowser: boolean): Promise<void> => {
    if (!settings || settings.showBuiltInBrowser === showBuiltInBrowser) {
      return
    }

    setIsSavingShowBuiltInBrowser(true)
    try {
      const nextSettings = await updateWebSearchSettings({
        showBuiltInBrowser
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.builtInBrowserVisibility', {
          state: showBuiltInBrowser
            ? t('settings.webSearch.toasts.windowVisible')
            : t('settings.webSearch.toasts.windowHidden')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSavingShowBuiltInBrowser(false)
    }
  }

  const setShowTiaBrowserTool = async (showTiaBrowserTool: boolean): Promise<void> => {
    if (!settings || settings.showTiaBrowserTool === showTiaBrowserTool) {
      return
    }

    setIsSavingShowTiaBrowserTool(true)
    try {
      const nextSettings = await updateWebSearchSettings({
        showTiaBrowserTool
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.tiaBrowserToolVisibility', {
          state: showTiaBrowserTool
            ? t('settings.webSearch.toasts.windowVisible')
            : t('settings.webSearch.toasts.windowHidden')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSavingShowTiaBrowserTool(false)
    }
  }

  const setBrowserAutomationMode = async (
    browserAutomationMode: BrowserAutomationMode
  ): Promise<void> => {
    if (!settings || settings.browserAutomationMode === browserAutomationMode) {
      return
    }

    setSavingBrowserAutomationMode(browserAutomationMode)
    try {
      const nextSettings = await updateWebSearchSettings({
        browserAutomationMode
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.browserAutomationModeUpdated', {
          mode:
            browserAutomationMode === 'tia-browser-tool'
              ? t('settings.webSearch.browserAutomation.modeTiaBrowserToolLabel')
              : t('settings.webSearch.browserAutomation.modeBuiltInBrowserLabel')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setSavingBrowserAutomationMode(null)
    }
  }

  const browserAutomationDescription =
    settings?.browserAutomationMode === 'tia-browser-tool'
      ? t('settings.webSearch.browserAutomation.modeTiaBrowserToolDescription')
      : t('settings.webSearch.browserAutomation.modeBuiltInBrowserDescription')

  return (
    <div className="py-4 flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.webSearch.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('settings.webSearch.description')}</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{t('settings.webSearch.browserAutomation.title')}</CardTitle>
          <CardDescription>{t('settings.webSearch.browserAutomation.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t('settings.webSearch.browserAutomation.loading')}
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-3">
                <div className="space-y-1">
                  <h2 className="text-base font-medium">
                    {t('settings.webSearch.browserAutomation.modeTitle')}
                  </h2>
                  <p className="text-muted-foreground text-sm">{browserAutomationDescription}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      settings?.browserAutomationMode === 'tia-browser-tool'
                        ? 'secondary'
                        : 'outline'
                    }
                    disabled={!settings || isSavingAnySetting}
                    onClick={() => {
                      void setBrowserAutomationMode('tia-browser-tool')
                    }}
                  >
                    {t('settings.webSearch.browserAutomation.modeTiaBrowserToolLabel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      settings?.browserAutomationMode === 'built-in-browser'
                        ? 'secondary'
                        : 'outline'
                    }
                    disabled={!settings || isSavingAnySetting}
                    onClick={() => {
                      void setBrowserAutomationMode('built-in-browser')
                    }}
                  >
                    {t('settings.webSearch.browserAutomation.modeBuiltInBrowserLabel')}
                  </Button>
                </div>
              </div>

              {settings?.browserAutomationMode === 'tia-browser-tool' ? (
                <SettingsSwitchRow
                  title={t('settings.webSearch.browserAutomation.showTiaBrowserToolTitle')}
                  description={
                    settings.showTiaBrowserTool
                      ? t('settings.webSearch.browserAutomation.showTiaBrowserToolVisible')
                      : t('settings.webSearch.browserAutomation.showTiaBrowserToolHidden')
                  }
                  checked={settings.showTiaBrowserTool}
                  disabled={!settings || isSavingAnySetting}
                  onCheckedChange={(checked) => {
                    void setShowTiaBrowserTool(checked)
                  }}
                />
              ) : (
                <SettingsSwitchRow
                  title={t('settings.webSearch.browserAutomation.showBuiltInBrowserTitle')}
                  description={
                    settings?.showBuiltInBrowser
                      ? t('settings.webSearch.browserAutomation.showBuiltInBrowserVisible')
                      : t('settings.webSearch.browserAutomation.showBuiltInBrowserHidden')
                  }
                  checked={settings?.showBuiltInBrowser ?? false}
                  disabled={!settings || isSavingAnySetting}
                  onCheckedChange={(checked) => {
                    void setShowBuiltInBrowser(checked)
                  }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{t('settings.webSearch.fetchWindow.title')}</CardTitle>
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

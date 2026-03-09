import { ExternalLink, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
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
import { cn } from '../../../lib/utils'
import {
  getWebSearchSettings,
  updateWebSearchSettings,
  type WebSearchEngine,
  type WebSearchSettings
} from '../web-search/web-search-query'

type EnginePresentation = {
  label: string
  description: string
  settingsUrl: string
}

const enginePresentation: Record<WebSearchEngine, EnginePresentation> = {
  google: {
    label: 'Google',
    description: 'Wide global index with broad results coverage.',
    settingsUrl: 'https://www.google.com/preferences'
  },
  bing: {
    label: 'Bing',
    description: 'More consistent for direct fetch-based search pages.',
    settingsUrl: 'https://www.bing.com/account/general'
  },
  baidu: {
    label: 'Baidu',
    description: 'Useful when you prefer Chinese-language search ranking.',
    settingsUrl: 'https://www.baidu.com'
  }
}

export function WebSearchSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<WebSearchSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savingEngine, setSavingEngine] = useState<WebSearchEngine | null>(null)
  const [isSavingWindowBehavior, setIsSavingWindowBehavior] = useState(false)
  const [isSavingShowBrowser, setIsSavingShowBrowser] = useState(false)

  const localizedEnginePresentation: Record<WebSearchEngine, EnginePresentation> = {
    google: {
      ...enginePresentation.google,
      label: t('settings.webSearch.engines.google.label'),
      description: t('settings.webSearch.engines.google.description')
    },
    bing: {
      ...enginePresentation.bing,
      label: t('settings.webSearch.engines.bing.label'),
      description: t('settings.webSearch.engines.bing.description')
    },
    baidu: {
      ...enginePresentation.baidu,
      label: t('settings.webSearch.engines.baidu.label'),
      description: t('settings.webSearch.engines.baidu.description')
    }
  }

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
      const nextSettings = await getWebSearchSettings()
      setSettings(nextSettings)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [toErrorMessage])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const availableEngines = settings?.availableEngines ?? []

  const setDefaultEngine = async (engine: WebSearchEngine): Promise<void> => {
    if (settings?.defaultEngine === engine) {
      return
    }

    setSavingEngine(engine)

    try {
      const nextSettings = await updateWebSearchSettings({
        defaultEngine: engine
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.defaultSet', {
          engine: localizedEnginePresentation[engine].label
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setSavingEngine(null)
    }
  }

  const setKeepBrowserWindowOpen = async (keepBrowserWindowOpen: boolean): Promise<void> => {
    if (!settings || settings.keepBrowserWindowOpen === keepBrowserWindowOpen) {
      return
    }

    setIsSavingWindowBehavior(true)

    try {
      const nextSettings = await updateWebSearchSettings({
        keepBrowserWindowOpen
      })
      setSettings(nextSettings)
      toast.success(
        t('settings.webSearch.toasts.backgroundWindow', {
          state: keepBrowserWindowOpen
            ? t('settings.webSearch.toasts.backgroundEnabled')
            : t('settings.webSearch.toasts.backgroundDisabled')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSavingWindowBehavior(false)
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
        t('settings.webSearch.toasts.browserVisibility', {
          state: showBrowser
            ? t('settings.webSearch.toasts.browserVisible')
            : t('settings.webSearch.toasts.browserHidden')
        })
      )
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSavingShowBrowser(false)
    }
  }

  const openEngineSettings = async (engine: WebSearchEngine): Promise<void> => {
    const details = localizedEnginePresentation[engine]
    const openInSearchContext = window.tiaDesktop?.openWebSearchSettings

    if (!openInSearchContext) {
      window.open(details.settingsUrl, '_blank', 'noopener,noreferrer')
      return
    }

    try {
      await openInSearchContext(details.settingsUrl)
    } catch (error) {
      toast.error(
        t('settings.webSearch.toasts.openSettingsError', {
          engine: details.label,
          message: toErrorMessage(error)
        })
      )
    }
  }

  return (
    <div className="py-4 flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.webSearch.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('settings.webSearch.description')}</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{t('settings.webSearch.defaultEngine.title')}</CardTitle>
          <CardDescription>{t('settings.webSearch.defaultEngine.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t('settings.webSearch.defaultEngine.loading')}
            </p>
          ) : null}

          {!isLoading && availableEngines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('settings.webSearch.defaultEngine.empty')}
            </p>
          ) : null}

          {availableEngines.map((engine) => {
            const details = localizedEnginePresentation[engine]
            const isDefault = settings?.defaultEngine === engine
            const isSaving = savingEngine === engine

            return (
              <article
                key={engine}
                className={cn(
                  'rounded-xl border px-4 py-3',
                  isDefault ? 'border-primary/70 bg-primary/10' : 'border-border/70 bg-card/60'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-medium">{details.label}</h2>
                    <p className="text-muted-foreground text-sm">{details.description}</p>
                  </div>
                  <Button
                    type="button"
                    variant={isDefault ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={
                      isDefault ||
                      Boolean(savingEngine) ||
                      isSavingWindowBehavior ||
                      isSavingShowBrowser
                    }
                    onClick={() => {
                      void setDefaultEngine(engine)
                    }}
                  >
                    {isSaving
                      ? t('settings.webSearch.buttons.saving')
                      : isDefault
                        ? t('settings.webSearch.buttons.default')
                        : t('settings.webSearch.buttons.setDefault')}
                  </Button>
                </div>

                <div className="mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      isSaving ||
                      Boolean(savingEngine) ||
                      isSavingWindowBehavior ||
                      isSavingShowBrowser
                    }
                    onClick={() => {
                      void openEngineSettings(engine)
                    }}
                  >
                    <Search className="size-4" />
                    {t('settings.webSearch.buttons.openSettings', { engine: details.label })}
                    <ExternalLink className="size-3.5" />
                  </Button>
                </div>
              </article>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{t('settings.webSearch.browserBehavior.title')}</CardTitle>
          <CardDescription>{t('settings.webSearch.browserBehavior.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t('settings.webSearch.browserBehavior.loading')}
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3">
                <div className="space-y-1 flex-1">
                  <h2 className="text-base font-medium">
                    {t('settings.webSearch.browserBehavior.backgroundTitle')}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {settings?.keepBrowserWindowOpen
                      ? t('settings.webSearch.browserBehavior.backgroundEnabled')
                      : t('settings.webSearch.browserBehavior.backgroundDisabled')}
                  </p>
                </div>
                <Switch
                  checked={settings?.keepBrowserWindowOpen ?? true}
                  disabled={
                    Boolean(savingEngine) ||
                    isSavingWindowBehavior ||
                    isSavingShowBrowser ||
                    !settings
                  }
                  onCheckedChange={(checked) => {
                    void setKeepBrowserWindowOpen(checked)
                  }}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3">
                <div className="space-y-1 flex-1">
                  <h2 className="text-base font-medium">
                    {t('settings.webSearch.browserBehavior.showBrowserTitle')}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {settings?.showBrowser
                      ? t('settings.webSearch.browserBehavior.showBrowserVisible')
                      : t('settings.webSearch.browserBehavior.showBrowserHidden')}
                  </p>
                </div>
                <Switch
                  checked={settings?.showBrowser ?? false}
                  disabled={
                    Boolean(savingEngine) ||
                    isSavingWindowBehavior ||
                    isSavingShowBrowser ||
                    !settings
                  }
                  onCheckedChange={(checked) => {
                    void setShowBrowser(checked)
                  }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

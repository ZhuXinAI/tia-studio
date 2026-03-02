import { ExternalLink, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'
import { SettingsSidebarNav } from '../components/settings-sidebar-nav'
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

type ToastState = {
  kind: 'success' | 'error'
  message: string
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected request error'
}

export function WebSearchSettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<WebSearchSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savingEngine, setSavingEngine] = useState<WebSearchEngine | null>(null)
  const [isSavingWindowBehavior, setIsSavingWindowBehavior] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setToast(null)
    try {
      const nextSettings = await getWebSearchSettings()
      setSettings(nextSettings)
    } catch (error) {
      setToast({
        kind: 'error',
        message: toErrorMessage(error)
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const availableEngines = settings?.availableEngines ?? []

  const setDefaultEngine = async (engine: WebSearchEngine): Promise<void> => {
    if (settings?.defaultEngine === engine) {
      return
    }

    setSavingEngine(engine)
    setToast(null)

    try {
      const nextSettings = await updateWebSearchSettings({
        defaultEngine: engine
      })
      setSettings(nextSettings)
      setToast({
        kind: 'success',
        message: `${enginePresentation[engine].label} is now the default web search engine.`
      })
    } catch (error) {
      setToast({
        kind: 'error',
        message: toErrorMessage(error)
      })
    } finally {
      setSavingEngine(null)
    }
  }

  const setKeepBrowserWindowOpen = async (keepBrowserWindowOpen: boolean): Promise<void> => {
    if (!settings || settings.keepBrowserWindowOpen === keepBrowserWindowOpen) {
      return
    }

    setIsSavingWindowBehavior(true)
    setToast(null)

    try {
      const nextSettings = await updateWebSearchSettings({
        keepBrowserWindowOpen
      })
      setSettings(nextSettings)
      setToast({
        kind: 'success',
        message: `Background browser window is now ${keepBrowserWindowOpen ? 'enabled' : 'disabled'}.`
      })
    } catch (error) {
      setToast({
        kind: 'error',
        message: toErrorMessage(error)
      })
    } finally {
      setIsSavingWindowBehavior(false)
    }
  }

  return (
    <section className="grid gap-4 grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-18 self-start">
        <SettingsSidebarNav />
      </aside>

      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Web Search</h1>
          <p className="text-muted-foreground text-sm">
            Choose one default engine and every browser search tool call will use it.
          </p>
        </header>

        {toast ? (
          <p
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              toast.kind === 'error'
                ? 'border-destructive/70 text-destructive'
                : 'border-emerald-400/70 text-emerald-300'
            )}
          >
            {toast.message}
          </p>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Default Search Engine</CardTitle>
            <CardDescription>Google, Bing, and Baidu are supported.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading search settings...</p>
            ) : null}

            {!isLoading && availableEngines.length === 0 ? (
              <p className="text-muted-foreground text-sm">No engines available.</p>
            ) : null}

            {availableEngines.map((engine) => {
              const details = enginePresentation[engine]
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
                      disabled={isDefault || Boolean(savingEngine) || isSavingWindowBehavior}
                      onClick={() => {
                        void setDefaultEngine(engine)
                      }}
                    >
                      {isSaving ? 'Saving...' : isDefault ? 'Default' : 'Set Default'}
                    </Button>
                  </div>

                  <div className="mt-3">
                    <Button asChild type="button" variant="ghost" size="sm">
                      <a href={details.settingsUrl} target="_blank" rel="noreferrer">
                        <Search className="size-4" />
                        Open {details.label} Settings
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </div>
                </article>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Browser Window Behavior</CardTitle>
            <CardDescription>
              Keep an isolated browser window in the background for future search tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading browser window behavior...</p>
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3">
                <div className="space-y-1">
                  <h2 className="text-base font-medium">Background Browser Window</h2>
                  <p className="text-muted-foreground text-sm">
                    {settings?.keepBrowserWindowOpen
                      ? 'Reuses one hidden BrowserWindow for web search.'
                      : 'Creates and closes a BrowserWindow per search request.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={Boolean(savingEngine) || isSavingWindowBehavior || !settings}
                  onClick={() => {
                    void setKeepBrowserWindowOpen(!(settings?.keepBrowserWindowOpen ?? true))
                  }}
                >
                  {isSavingWindowBehavior
                    ? 'Saving...'
                    : settings?.keepBrowserWindowOpen
                      ? 'Disable'
                      : 'Enable'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Square,
  X
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BrowserBridge, BrowserTab, BrowserTabsState } from '../../../../../shared/browser'
import { normalizeBrowserUrl } from '../../../../../shared/browser'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'

type BrowserRailProps = {
  slotElement: HTMLDivElement | null
  onClose: () => void
  initialUrl?: string
}

function getNativeBrowserBridge(): BrowserBridge | null {
  return typeof window !== 'undefined' ? (window.tiaStudio?.browser ?? null) : null
}

function displayTabTitle(tab: BrowserTab): string {
  if (tab.title.trim()) return tab.title
  if (tab.url === 'about:blank') return 'New tab'

  try {
    return new URL(tab.url).hostname || 'New tab'
  } catch {
    return 'New tab'
  }
}

function BrowserRailFallback({
  slotElement,
  onClose,
  initialUrl
}: BrowserRailProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [draftUrl, setDraftUrl] = useState(initialUrl ?? '')
  const [url, setUrl] = useState(() => normalizeBrowserUrl(initialUrl ?? '') ?? '')
  const [reloadKey, setReloadKey] = useState(0)
  const invalid = draftUrl.trim().length > 0 && !normalizeBrowserUrl(draftUrl)

  if (!slotElement) return null
  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Globe2 className="size-4" /> {t('browserRail.title')}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t('browserRail.description')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={!url}
            aria-label={t('browserRail.reload')}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label={t('browserRail.close')}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <form
        className="border-b border-border/60 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          const next = normalizeBrowserUrl(draftUrl)
          if (next) setUrl(next)
        }}
      >
        <div className="flex gap-2">
          <Input
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            className="h-8 font-mono text-xs"
            placeholder="https://example.com"
            aria-label={t('browserRail.urlLabel')}
          />
          <Button type="submit" size="sm" className="h-8">
            {t('browserRail.open')}
          </Button>
        </div>
        {invalid ? (
          <p className="mt-1 text-[11px] text-destructive">{t('browserRail.invalidUrl')}</p>
        ) : null}
      </form>
      <div className="min-h-0 flex-1 bg-muted/20">
        {url ? (
          <iframe
            key={reloadKey}
            src={url}
            title={t('browserRail.iframeTitle')}
            className="h-full min-h-0 w-full border-0"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
            {t('browserRail.empty')}
          </div>
        )}
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1 border-t border-border/60 px-3 py-2 text-xs text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" /> {t('browserRail.openExternally')}
        </a>
      ) : null}
    </div>,
    slotElement
  )
}

function NativeBrowserRail({
  bridge,
  slotElement,
  onClose,
  initialUrl
}: BrowserRailProps & { bridge: BrowserBridge }): React.JSX.Element | null {
  const { t } = useTranslation()
  const [state, setState] = useState<BrowserTabsState>({ tabs: [], activeTabId: null })
  const [draftUrl, setDraftUrl] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const viewSlotRef = useRef<HTMLDivElement | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const createdInitialTabRef = useRef(false)

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
    [state.activeTabId, state.tabs]
  )

  useEffect(() => bridge.onState(setState), [bridge])

  useEffect(() => {
    let cancelled = false

    const createInitialTabIfNeeded = (nextState: BrowserTabsState): void => {
      if (cancelled || createdInitialTabRef.current || nextState.tabs.length > 0) return
      createdInitialTabRef.current = true
      const url = normalizeBrowserUrl(initialUrl ?? '') ?? undefined
      void bridge.createTab(url).catch((error: unknown) => {
        if (!cancelled)
          setActionError(error instanceof Error ? error.message : t('browserRail.unavailable'))
      })
    }

    void bridge
      .getState()
      .then((nextState) => {
        if (cancelled) return
        setState(nextState)
        createInitialTabIfNeeded(nextState)
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setActionError(error instanceof Error ? error.message : t('browserRail.unavailable'))
      })

    return () => {
      cancelled = true
    }
  }, [bridge, initialUrl, t])

  useEffect(() => {
    if (!activeTab || isEditingUrl) return
    setDraftUrl(activeTab.url === 'about:blank' ? '' : activeTab.url)
  }, [activeTab, isEditingUrl])

  useEffect(() => {
    const node = viewSlotRef.current
    if (!node) return

    const syncBounds = (): void => {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        bridge.setViewBounds(null)
        return
      }
      bridge.setViewBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      })
    }

    syncBounds()
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncBounds)
    resizeObserver?.observe(node)
    window.addEventListener('resize', syncBounds)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncBounds)
      bridge.setViewBounds(null)
    }
  }, [bridge])

  if (!slotElement) return null

  const runAction = (action: () => Promise<void>): void => {
    setActionError(null)
    void action().catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : t('browserRail.actionFailed'))
    })
  }

  const submitUrl = (): void => {
    if (!activeTab) return
    const nextUrl = normalizeBrowserUrl(draftUrl)
    if (!nextUrl) {
      setActionError(t('browserRail.invalidUrl'))
      return
    }
    setIsEditingUrl(false)
    runAction(() => bridge.navigate(activeTab.id, nextUrl))
  }

  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <div className="flex min-h-10 items-center gap-1 border-b border-border/60 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
          {state.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex min-w-0 max-w-44 items-center rounded-md border text-xs ${
                tab.id === state.activeTabId
                  ? 'border-border bg-muted/70 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                onClick={() => runAction(() => bridge.activateTab(tab.id))}
                aria-label={t('browserRail.activateTab', { title: displayTabTitle(tab) })}
                aria-pressed={tab.id === state.activeTabId}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {tab.loading ? (
                    <LoaderCircle className="size-3 shrink-0 animate-spin" />
                  ) : (
                    <Globe2 className="size-3 shrink-0" />
                  )}
                  <span className="truncate">{displayTabTitle(tab)}</span>
                </span>
              </button>
              <button
                type="button"
                className="mr-1 rounded p-0.5 opacity-60 hover:bg-background hover:opacity-100"
                onClick={() => runAction(() => bridge.closeTab(tab.id))}
                aria-label={t('browserRail.closeTab', { title: displayTabTitle(tab) })}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() =>
              runAction(async () => {
                await bridge.createTab()
              })
            }
            aria-label={t('browserRail.newTab')}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClose}
          aria-label={t('browserRail.close')}
        >
          <X className="size-4" />
        </Button>
      </div>

      <form
        className="flex items-center gap-1 border-b border-border/60 p-2"
        onSubmit={(event) => {
          event.preventDefault()
          submitUrl()
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={!activeTab?.canGoBack}
          onClick={() => activeTab && runAction(() => bridge.goBack(activeTab.id))}
          aria-label={t('browserRail.back')}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={!activeTab?.canGoForward}
          onClick={() => activeTab && runAction(() => bridge.goForward(activeTab.id))}
          aria-label={t('browserRail.forward')}
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={!activeTab}
          onClick={() =>
            activeTab &&
            runAction(() =>
              activeTab.loading ? bridge.stop(activeTab.id) : bridge.reload(activeTab.id)
            )
          }
          aria-label={activeTab?.loading ? t('browserRail.stop') : t('browserRail.reload')}
        >
          {activeTab?.loading ? <Square className="size-3" /> : <RefreshCw className="size-3.5" />}
        </Button>
        <Input
          ref={urlInputRef}
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          onFocus={() => setIsEditingUrl(true)}
          onBlur={() => setIsEditingUrl(false)}
          className="h-7 min-w-0 flex-1 font-mono text-[11px]"
          placeholder="https://example.com"
          aria-label={t('browserRail.urlLabel')}
        />
        <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={!activeTab}>
          {t('browserRail.open')}
        </Button>
        {activeTab && activeTab.url !== 'about:blank' ? (
          <a
            href={activeTab.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('browserRail.openExternally')}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </form>

      {actionError ? (
        <p className="border-b border-border/60 px-3 py-1.5 text-[11px] text-destructive">
          {actionError}
        </p>
      ) : null}
      <div ref={viewSlotRef} className="relative min-h-0 flex-1 bg-muted/20">
        {!activeTab ? (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
            {t('browserRail.noTabs')}
          </div>
        ) : null}
      </div>
    </div>,
    slotElement
  )
}

export function BrowserRail(props: BrowserRailProps): React.JSX.Element | null {
  const bridge = getNativeBrowserBridge()
  if (!bridge) return <BrowserRailFallback {...props} />
  return <NativeBrowserRail {...props} bridge={bridge} />
}

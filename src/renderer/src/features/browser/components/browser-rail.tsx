import { ExternalLink, Globe2, RefreshCw, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function BrowserRail({
  slotElement,
  onClose,
  initialUrl
}: {
  slotElement: HTMLDivElement | null
  onClose: () => void
  initialUrl?: string
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [draftUrl, setDraftUrl] = useState(initialUrl ?? 'http://localhost:3000')
  const [url, setUrl] = useState(() => safeUrl(initialUrl ?? '') ?? '')
  const [reloadKey, setReloadKey] = useState(0)
  const invalid = draftUrl.trim().length > 0 && !safeUrl(draftUrl)
  if (!slotElement) return null
  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="size-4" /> {t('browserRail.title')}</h2>
          <p className="text-[11px] text-muted-foreground">{t('browserRail.description')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setReloadKey((key) => key + 1)} disabled={!url} aria-label={t('browserRail.reload')}><RefreshCw className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t('browserRail.close')}><X className="size-4" /></Button>
        </div>
      </header>
      <form className="border-b border-border/60 p-3" onSubmit={(event) => { event.preventDefault(); const next = safeUrl(draftUrl); if (next) setUrl(next) }}>
        <div className="flex gap-2">
          <Input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} className="h-8 font-mono text-xs" placeholder="https://example.com" aria-label={t('browserRail.urlLabel')} />
          <Button type="submit" size="sm" className="h-8">{t('browserRail.open')}</Button>
        </div>
        {invalid ? <p className="mt-1 text-[11px] text-destructive">{t('browserRail.invalidUrl')}</p> : null}
      </form>
      <div className="min-h-0 flex-1 bg-muted/20">
        {url ? (
          <iframe key={reloadKey} src={url} title={t('browserRail.iframeTitle')} className="h-full min-h-0 w-full border-0" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts" />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">{t('browserRail.empty')}</div>
        )}
      </div>
      {url ? <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 border-t border-border/60 px-3 py-2 text-xs text-primary hover:underline"><ExternalLink className="size-3.5" /> {t('browserRail.openExternally')}</a> : null}
    </div>,
    slotElement
  )
}

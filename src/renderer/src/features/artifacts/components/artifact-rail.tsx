import {
  Download,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Globe2,
  PackageOpen,
  X
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import type { AgentArtifact, AgentArtifactKind } from '../../../../../shared/artifacts'
import { Button } from '../../../components/ui/button'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { createApiClient } from '../../../lib/api-client'
import { useTranslation } from '../../../i18n/use-app-translation'
import { useAgentArtifacts } from '../artifacts-query'

const api = createApiClient()

function artifactIcon(kind: AgentArtifactKind): React.JSX.Element {
  if (kind === 'image') return <FileImage className="size-4" />
  if (kind === 'document') return <FileText className="size-4" />
  if (kind === 'spreadsheet') return <FileSpreadsheet className="size-4" />
  if (kind === 'webpage') return <Globe2 className="size-4" />
  if (kind === 'text') return <FileCode2 className="size-4" />
  if (kind === 'tool-output') return <PackageOpen className="size-4" />
  return <File className="size-4" />
}

function formatSize(sizeBytes?: number): string | null {
  if (sizeBytes === undefined) return null
  if (sizeBytes < 1_024) return `${sizeBytes} B`
  if (sizeBytes < 1_024 * 1_024) return `${Math.round(sizeBytes / 1_024)} KB`
  return `${(sizeBytes / (1_024 * 1_024)).toFixed(1)} MB`
}

function ArtifactCard({ artifact }: { artifact: AgentArtifact }): React.JSX.Element {
  const { t } = useTranslation()
  const size = formatSize(artifact.sizeBytes)

  async function download(): Promise<void> {
    if (!artifact.relativePath) return
    try {
      const blob = await api.getBlob(
        `/v1/agent/sessions/${encodeURIComponent(artifact.sessionId)}/artifacts/${encodeURIComponent(artifact.id)}/content?download=1`
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      toast.success(t('artifactRail.downloadStarted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('artifactRail.downloadFailed'))
    }
  }

  return (
    <article className="rounded-xl border border-border/60 bg-background/70 p-3 shadow-sm">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 text-muted-foreground">{artifactIcon(artifact.kind)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={artifact.name}>
            {artifact.name}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {artifact.relativePath ?? artifact.url ?? artifact.sourceToolName ?? artifact.kind}
            {size ? ` · ${size}` : ''}
          </p>
        </div>
      </div>
      {artifact.previewText ? (
        <pre className="mt-2 max-h-32 overflow-hidden whitespace-pre-wrap rounded-lg bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {artifact.previewText}
        </pre>
      ) : null}
      {artifact.relativePath ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full justify-center text-xs"
          onClick={() => void download()}
        >
          <Download className="size-3.5" /> {t('artifactRail.download')}
        </Button>
      ) : null}
      {artifact.url ? (
        <a
          className="mt-2 block truncate text-xs text-primary underline-offset-2 hover:underline"
          href={artifact.url}
          target="_blank"
          rel="noreferrer"
        >
          Open source
        </a>
      ) : null}
    </article>
  )
}

export function ArtifactRail({
  sessionId,
  slotElement,
  onClose
}: {
  sessionId: string
  slotElement: HTMLDivElement | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data: artifacts = [], isLoading, isError } = useAgentArtifacts(sessionId)
  if (!slotElement) return null
  return createPortal(
    <div className="flex min-h-0 h-full flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t('artifactRail.title')}</h2>
          <p className="text-[11px] text-muted-foreground">
            {artifacts.length
              ? t('artifactRail.results', { count: artifacts.length })
              : t('artifactRail.description')}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t('artifactRail.close')}>
          <X className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-3">
          {isLoading ? <p className="p-2 text-xs text-muted-foreground">{t('artifactRail.loading')}</p> : null}
          {isError ? <p className="p-2 text-xs text-destructive">{t('artifactRail.loadFailed')}</p> : null}
          {!isLoading && !isError && artifacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              {t('artifactRail.empty')}
            </div>
          ) : null}
          {artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)}
        </div>
      </ScrollArea>
    </div>,
    slotElement
  )
}

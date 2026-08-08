import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  Folder,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Save,
  X
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Virtuoso } from 'react-virtuoso'
import type { WorkspaceDirectory, WorkspaceFileEntry } from '../../../../../shared/workspace-files'
import { Button } from '../../../components/ui/button'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  useSaveWorkspaceFile,
  useWorkspaceDirectories,
  useWorkspaceFile,
  workspaceFileKeys
} from '../files-query'
import { describeRequestError } from '../../../lib/request-errors'

const CodeEditor = lazy(() =>
  import('./code-editor').then((module) => ({ default: module.CodeEditor }))
)

type TreeItem = {
  entry: WorkspaceFileEntry
  depth: number
}

function fileIcon(name: string): React.JSX.Element {
  const extension = name.split('.').pop()?.toLowerCase()
  if (
    extension &&
    ['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'py', 'md'].includes(extension)
  ) {
    return <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
  }
  return <File className="size-3.5 shrink-0 text-muted-foreground" />
}

function getDirectoryData(
  paths: string[],
  queries: ReturnType<typeof useWorkspaceDirectories>
): Map<string, { data?: WorkspaceDirectory; isLoading: boolean; isError: boolean }> {
  return new Map(
    paths.map((path, index) => [
      path,
      {
        data: queries[index]?.data,
        isLoading: queries[index]?.isLoading ?? false,
        isError: queries[index]?.isError ?? false
      }
    ])
  )
}

function FilesTree({
  sessionId,
  selectedPath,
  onSelect
}: {
  sessionId: string
  selectedPath: string | null
  onSelect: (entry: WorkspaceFileEntry) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(['']))
  const directoryPaths = useMemo(
    () => [...expandedPaths].sort((left, right) => left.localeCompare(right)),
    [expandedPaths]
  )
  const directoryQueries = useWorkspaceDirectories(sessionId, directoryPaths)
  const directoryData = getDirectoryData(directoryPaths, directoryQueries)
  const visibleItems = useMemo(() => {
    const items: TreeItem[] = []

    function visit(relativePath: string, depth: number): void {
      const directory = directoryData.get(relativePath)?.data
      if (!directory) return
      for (const entry of directory.entries) {
        items.push({ entry, depth })
        if (entry.kind === 'directory' && expandedPaths.has(entry.relativePath)) {
          visit(entry.relativePath, depth + 1)
        }
      }
    }

    visit('', 0)
    return items
  }, [directoryData, expandedPaths])
  const rootQuery = directoryData.get('')

  function toggleDirectory(relativePath: string): void {
    setExpandedPaths((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }

  if (rootQuery?.isError) {
    return <p className="p-3 text-xs text-destructive">{t('filesRail.loadFailed')}</p>
  }

  if (rootQuery?.isLoading && !rootQuery.data) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" /> {t('filesRail.loading')}
      </div>
    )
  }

  if (!visibleItems.length) {
    return <p className="p-3 text-xs text-muted-foreground">{t('filesRail.empty')}</p>
  }

  return (
    <Virtuoso
      data={visibleItems}
      className="h-full"
      itemContent={(_, item) => {
        const isExpanded =
          item.entry.kind === 'directory' && expandedPaths.has(item.entry.relativePath)
        const childQuery =
          item.entry.kind === 'directory' ? directoryData.get(item.entry.relativePath) : undefined
        const isSelected = item.entry.kind === 'file' && item.entry.relativePath === selectedPath
        return (
          <button
            type="button"
            className={`flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-xs hover:bg-muted/50 ${isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
            style={{ paddingLeft: `${8 + item.depth * 14}px` }}
            onClick={() =>
              item.entry.kind === 'directory'
                ? toggleDirectory(item.entry.relativePath)
                : onSelect(item.entry)
            }
            aria-expanded={item.entry.kind === 'directory' ? isExpanded : undefined}
          >
            {item.entry.kind === 'directory' ? (
              isExpanded ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )
            ) : (
              <span className="size-3 shrink-0" />
            )}
            {item.entry.kind === 'directory' ? (
              <Folder className="size-3.5 shrink-0 text-amber-500" />
            ) : (
              fileIcon(item.entry.name)
            )}
            <span className="min-w-0 flex-1 truncate" title={item.entry.relativePath}>
              {item.entry.name}
            </span>
            {childQuery?.isLoading ? <LoaderCircle className="size-3 animate-spin" /> : null}
          </button>
        )
      }}
    />
  )
}

function FileViewer({
  sessionId,
  relativePath,
  onClose
}: {
  sessionId: string
  relativePath: string | null
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileQuery = useWorkspaceFile(sessionId, relativePath)
  const saveMutation = useSaveWorkspaceFile(sessionId)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsEditing(false)
    setDraft('')
    setError(null)
  }, [relativePath])

  useEffect(() => {
    if (fileQuery.data && !isEditing) setDraft(fileQuery.data.content)
  }, [fileQuery.data, isEditing])

  if (!relativePath) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-4 text-center text-xs text-muted-foreground">
        {t('filesRail.selectFile')}
      </div>
    )
  }

  function beginEditing(): void {
    if (!fileQuery.data) return
    setError(null)
    setDraft(fileQuery.data.content)
    setIsEditing(true)
  }

  function save(): void {
    const file = fileQuery.data
    if (!file || saveMutation.isPending) return
    setError(null)
    void saveMutation
      .mutateAsync({ path: file.relativePath, content: draft, expectedSha256: file.sha256 })
      .then(() => setIsEditing(false))
      .catch((nextError: unknown) =>
        setError(describeRequestError(nextError, t('filesRail.saveFailed')))
      )
  }

  function refresh(): void {
    if (!relativePath) return
    setError(null)
    void queryClient.invalidateQueries({
      queryKey: workspaceFileKeys.content(sessionId, relativePath)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px]" title={relativePath}>
          {relativePath}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={refresh}
          disabled={fileQuery.isFetching || isEditing}
          aria-label={t('filesRail.refresh')}
        >
          <RefreshCw className={`size-3 ${fileQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
        {isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={save}
            disabled={saveMutation.isPending}
            aria-label={t('filesRail.save')}
          >
            {saveMutation.isPending ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={beginEditing}
            disabled={!fileQuery.data}
            aria-label={t('filesRail.edit')}
          >
            <Pencil className="size-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onClose}
          aria-label={t('filesRail.closeFile')}
        >
          <X className="size-3" />
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1 border-b border-red-300/20 bg-red-500/10 px-2 py-1.5 text-[10px] text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {error}
        </p>
      ) : null}
      {fileQuery.isLoading ? (
        <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" /> {t('filesRail.loadingFile')}
        </div>
      ) : fileQuery.isError ? (
        <p className="p-3 text-xs text-destructive">
          {describeRequestError(fileQuery.error, t('filesRail.previewFailed'))}
        </p>
      ) : fileQuery.data ? (
        isEditing ? (
          <Suspense
            fallback={
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none overflow-auto bg-muted/20 p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={t('filesRail.editorLabel', { name: fileQuery.data.name })}
              />
            }
          >
            <CodeEditor
              key={fileQuery.data.relativePath}
              relativePath={fileQuery.data.relativePath}
              value={draft}
              onChange={setDraft}
              ariaLabel={t('filesRail.editorLabel', { name: fileQuery.data.name })}
            />
          </Suspense>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {fileQuery.data.content || t('filesRail.emptyFile')}
          </pre>
        )
      ) : null}
    </div>
  )
}

export function FilesRail({
  sessionId,
  slotElement,
  onClose
}: {
  sessionId: string
  slotElement: HTMLDivElement | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const queryClient = useQueryClient()

  if (!slotElement) return null
  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Folder className="size-4 text-amber-500" /> {t('filesRail.title')}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t('filesRail.description')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void queryClient.invalidateQueries({ queryKey: workspaceFileKeys.all })}
            aria-label={t('filesRail.refresh')}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label={t('filesRail.close')}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex h-[42%] min-h-36 shrink-0 flex-col border-b border-border/60">
        <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>{t('filesRail.tree')}</span>
          <span>{t('filesRail.lazy')}</span>
        </div>
        <div className="min-h-0 flex-1">
          <FilesTree
            sessionId={sessionId}
            selectedPath={selectedPath}
            onSelect={(entry) => setSelectedPath(entry.relativePath)}
          />
        </div>
      </div>
      <FileViewer
        sessionId={sessionId}
        relativePath={selectedPath}
        onClose={() => setSelectedPath(null)}
      />
    </div>,
    slotElement
  )
}

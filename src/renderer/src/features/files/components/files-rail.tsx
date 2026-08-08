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
import { asyncDataLoaderFeature, hotkeysCoreFeature, selectionFeature } from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import { createPortal } from 'react-dom'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Virtuoso } from 'react-virtuoso'
import type { WorkspaceFileEntry } from '../../../../../shared/workspace-files'
import { Button } from '../../../components/ui/button'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  useSaveWorkspaceFile,
  getWorkspaceDirectory,
  useWorkspaceFile,
  workspaceFileKeys
} from '../files-query'
import { describeRequestError } from '../../../lib/request-errors'

const CodeEditor = lazy(() =>
  import('./code-editor').then((module) => ({ default: module.CodeEditor }))
)

const FILE_TREE_ROOT_ID = '__tia-workspace-root__'

type WorkspaceTreeItem = {
  id: string
  entry: WorkspaceFileEntry
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

function FilesTree({
  sessionId,
  selectedPath,
  onSelect,
  refreshToken
}: {
  sessionId: string
  selectedPath: string | null
  onSelect: (entry: WorkspaceFileEntry) => void
  refreshToken: number
}): React.JSX.Element {
  const { t } = useTranslation()
  const [directoryErrors, setDirectoryErrors] = useState<Record<string, string>>({})
  const itemData = useRef(new Map<string, WorkspaceTreeItem>())
  const rootItem = useRef<WorkspaceTreeItem>({
    id: FILE_TREE_ROOT_ID,
    entry: { name: 'Workspace', relativePath: '', kind: 'directory' }
  })

  const tree = useTree<WorkspaceTreeItem>({
    initialState: {
      expandedItems: [FILE_TREE_ROOT_ID]
    },
    rootItemId: FILE_TREE_ROOT_ID,
    getItemName: (item) => item.getItemData()?.entry.name ?? item.getId(),
    isItemFolder: (item) => item.getItemData()?.entry.kind === 'directory',
    createLoadingItemData: () => ({
      id: '__tia-loading-item__',
      entry: { name: t('filesRail.loading'), relativePath: '', kind: 'file' }
    }),
    dataLoader: {
      getItem: async (itemId) => {
        if (itemId === FILE_TREE_ROOT_ID) return rootItem.current
        const cached = itemData.current.get(itemId)
        if (cached) return cached
        // getChildrenWithData normally fills this cache before an item is
        // rendered. The fallback keeps a malformed/stale response from making
        // the tree crash while the next directory refresh repairs it.
        const fallback: WorkspaceTreeItem = {
          id: itemId,
          entry: {
            name: itemId.split('/').pop() ?? itemId,
            relativePath: itemId,
            kind: 'file'
          }
        }
        itemData.current.set(itemId, fallback)
        return fallback
      },
      getChildrenWithData: async (itemId) => {
        const relativePath = itemId === FILE_TREE_ROOT_ID ? '' : itemId
        try {
          const directory = await getWorkspaceDirectory(sessionId, relativePath)
          setDirectoryErrors((current) => {
            if (!(relativePath in current)) return current
            const next = { ...current }
            delete next[relativePath]
            return next
          })
          return directory.entries.map((entry) => {
            const item: WorkspaceTreeItem = { id: entry.relativePath, entry }
            itemData.current.set(item.id, item)
            return { id: item.id, data: item }
          })
        } catch (error) {
          setDirectoryErrors((current) => ({
            ...current,
            [relativePath]: describeRequestError(error, t('filesRail.loadFailed'))
          }))
          return []
        }
      }
    },
    onPrimaryAction: (item) => {
      const data = item.getItemData()
      if (data?.entry.kind === 'file') onSelect(data.entry)
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature]
  })

  useEffect(() => {
    if (refreshToken === 0) return
    const folders = [tree.getRootItem(), ...tree.getItems().filter((item) => item.isFolder())]
    void Promise.all(
      folders.map((item) => item.invalidateChildrenIds(false).catch(() => undefined))
    )
  }, [refreshToken, tree])

  const items = tree.getItems()
  const rootError = directoryErrors['']
  const isRootLoading = tree.getState().loadingItemChildrens?.includes(FILE_TREE_ROOT_ID) ?? false

  if (rootError && !items.length) {
    return <p className="p-3 text-xs text-destructive">{rootError}</p>
  }

  if (isRootLoading && !items.length) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" /> {t('filesRail.loading')}
      </div>
    )
  }

  if (!items.length) {
    return <p className="p-3 text-xs text-muted-foreground">{t('filesRail.empty')}</p>
  }

  return (
    <div {...tree.getContainerProps(t('filesRail.tree'))} className="h-full min-h-0">
      <Virtuoso
        data={items}
        className="h-full"
        computeItemKey={(_, item) => item.getKey()}
        itemContent={(_, item) => {
          const data = item.getItemData()
          const isFolder = item.isFolder()
          const isSelected = item.isSelected() || data?.entry.relativePath === selectedPath
          const directoryError = isFolder ? directoryErrors[data?.entry.relativePath ?? ''] : null
          const itemProps = item.getProps()
          return (
            <button
              {...itemProps}
              type="button"
              className={`flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-xs hover:bg-muted/50 ${isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              style={{ paddingLeft: `${8 + item.getItemMeta().level * 14}px` }}
            >
              {isFolder ? (
                item.isExpanded() ? (
                  <ChevronDown className="size-3 shrink-0" />
                ) : (
                  <ChevronRight className="size-3 shrink-0" />
                )
              ) : (
                <span className="size-3 shrink-0" />
              )}
              {isFolder ? (
                <Folder className="size-3.5 shrink-0 text-amber-500" />
              ) : (
                fileIcon(data?.entry.name ?? item.getItemName())
              )}
              <span
                className="min-w-0 flex-1 truncate"
                title={data?.entry.relativePath ?? item.getItemName()}
              >
                {data?.entry.name ?? item.getItemName()}
              </span>
              {directoryError ? (
                <AlertTriangle
                  className="size-3 shrink-0 text-destructive"
                  aria-label={directoryError}
                />
              ) : item.isLoading() ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : null}
            </button>
          )
        }}
      />
    </div>
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
          <ScrollArea className="min-h-0 flex-1 bg-muted/20">
            <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {fileQuery.data.content || t('filesRail.emptyFile')}
            </pre>
          </ScrollArea>
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
  const [treeRefreshToken, setTreeRefreshToken] = useState(0)
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
            onClick={() => {
              setTreeRefreshToken((current) => current + 1)
              void queryClient.invalidateQueries({ queryKey: workspaceFileKeys.all })
            }}
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
            key={sessionId}
            sessionId={sessionId}
            selectedPath={selectedPath}
            refreshToken={treeRefreshToken}
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

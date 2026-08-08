import { createPortal } from 'react-dom'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Folder, Globe2, PackageOpen, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useTranslation } from '../../i18n/use-app-translation'
import { useAgentArtifacts } from '../../features/artifacts/artifacts-query'
import { ArtifactRail } from '../../features/artifacts/components/artifact-rail'
import { TerminalRail } from '../../features/terminal/components/terminal-rail'
import { BrowserRail } from '../../features/browser/components/browser-rail'
import { useAppV2ShellBottomDrawer } from './app-v2-shell-bottom-drawer'
import { useAppV2ShellRightRail } from './app-v2-shell-right-rail'
import { cn } from '../../lib/utils'

const FilesRail = lazy(() =>
  import('../../features/files/components/files-rail').then((module) => ({
    default: module.FilesRail
  }))
)

type WorkspaceTool = 'browser' | 'files' | 'artifacts'
type BottomDrawerTool = 'terminal' | 'browser'

const workspaceToolIcons = {
  browser: Globe2,
  files: Folder,
  artifacts: PackageOpen
} as const

const bottomDrawerToolIcons = {
  terminal: TerminalIcon,
  browser: Globe2
} as const

function WorkspaceToolEmptyState({
  slotElement,
  onSelect,
  onClose
}: {
  slotElement: HTMLDivElement | null
  onSelect: (tool: WorkspaceTool) => void
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()

  if (!slotElement) return null

  const tools: Array<{
    id: WorkspaceTool
    label: string
    description: string
  }> = [
    {
      id: 'browser',
      label: t('threads.tools.preview'),
      description: t('threads.tools.browserDescription')
    },
    {
      id: 'files',
      label: t('threads.tools.files'),
      description: t('threads.tools.filesDescription')
    },
    {
      id: 'artifacts',
      label: t('threads.tools.artifacts'),
      description: t('threads.tools.artifactsDescription')
    }
  ]

  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95" data-testid="tools-empty-state">
      <header className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('threads.tools.title')}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('threads.tools.emptyDescription')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClose}
          aria-label={t('threads.tools.closePanel')}
          title={t('threads.tools.closePanel')}
        >
          <X className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="divide-y divide-border/60 border-y border-border/60">
          {tools.map((tool) => {
            const Icon = workspaceToolIcons[tool.id]
            return (
              <Button
                key={tool.id}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-3 rounded-none px-3 py-3 text-left hover:bg-muted/60"
                onClick={() => onSelect(tool.id)}
                aria-label={t(
                  tool.id === 'browser'
                    ? 'threads.tools.openBrowser'
                    : tool.id === 'files'
                      ? 'threads.tools.openFiles'
                      : 'threads.tools.openArtifacts'
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted/60 text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{tool.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
                    {tool.description}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      </ScrollArea>
    </div>,
    slotElement
  )
}

function WorkspaceToolPanel({
  sessionId,
  activeTool,
  slotElement,
  artifactCount,
  onSelect,
  onClose
}: {
  sessionId: string
  activeTool: WorkspaceTool
  slotElement: HTMLDivElement | null
  artifactCount: number
  onSelect: (tool: WorkspaceTool) => void
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [contentSlotElement, setContentSlotElement] = useState<HTMLDivElement | null>(null)
  const tools: Array<{ id: WorkspaceTool; label: string }> = [
    { id: 'browser', label: t('threads.tools.preview') },
    { id: 'files', label: t('threads.tools.files') },
    { id: 'artifacts', label: t('threads.tools.artifacts') }
  ]

  if (!slotElement) return null

  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95" data-testid="tools-panel">
      <header className="flex min-h-10 items-center gap-1 border-b border-border/60 px-2">
        <ScrollArea orientation="horizontal" className="min-w-0 flex-1">
          <div
            role="tablist"
            aria-label={t('threads.tools.title')}
            className="flex min-w-max gap-0.5 py-1"
          >
            {tools.map((tool) => {
              const Icon = workspaceToolIcons[tool.id]
              const isActive = tool.id === activeTool
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tool.label}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                  onClick={() => onSelect(tool.id)}
                >
                  <Icon className="size-3.5" />
                  <span>{tool.label}</span>
                  {tool.id === 'artifacts' && artifactCount > 0 ? (
                    <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                      {artifactCount}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </ScrollArea>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClose}
          aria-label={t('threads.tools.closePanel')}
          title={t('threads.tools.closePanel')}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div ref={setContentSlotElement} className="min-h-0 flex-1 overflow-hidden" />
      {contentSlotElement && activeTool === 'artifacts' ? (
        <ArtifactRail sessionId={sessionId} slotElement={contentSlotElement} onClose={onClose} />
      ) : null}
      {contentSlotElement && activeTool === 'files' ? (
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {t('filesRail.loading')}
            </div>
          }
        >
          <FilesRail sessionId={sessionId} slotElement={contentSlotElement} onClose={onClose} />
        </Suspense>
      ) : null}
      {contentSlotElement && activeTool === 'browser' ? (
        <BrowserRail slotElement={contentSlotElement} onClose={onClose} />
      ) : null}
    </div>,
    slotElement
  )
}

function WorkspaceBottomDrawerPanel({
  sessionId,
  activeTool,
  slotElement,
  onSelect,
  onClose
}: {
  sessionId: string
  activeTool: BottomDrawerTool
  slotElement: HTMLDivElement | null
  onSelect: (tool: BottomDrawerTool) => void
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [contentSlotElement, setContentSlotElement] = useState<HTMLDivElement | null>(null)
  const tools: Array<{ id: BottomDrawerTool; label: string }> = [
    { id: 'terminal', label: t('threads.tools.terminal') },
    { id: 'browser', label: t('threads.tools.preview') }
  ]

  if (!slotElement) return null

  return createPortal(
    <div
      className="flex h-full min-h-0 flex-col bg-[#080a10] text-white"
      data-testid="bottom-tools-panel"
    >
      <header className="flex min-h-10 items-center gap-1 border-b border-white/10 bg-black/20 px-2">
        <ScrollArea
          orientation="horizontal"
          role="tablist"
          aria-label={t('threads.tools.title')}
          className="min-w-0 flex-1"
        >
          <div className="flex min-w-max items-center gap-0.5 py-1">
            {tools.map((tool) => {
              const Icon = bottomDrawerToolIcons[tool.id]
              const isActive = tool.id === activeTool
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tool.label}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  )}
                  onClick={() => onSelect(tool.id)}
                >
                  <Icon className="size-3.5" />
                  <span>{tool.label}</span>
                </button>
              )
            })}
          </div>
        </ScrollArea>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label={t('threads.tools.closePanel')}
          title={t('threads.tools.closePanel')}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div ref={setContentSlotElement} className="min-h-0 flex-1 overflow-hidden" />
      {contentSlotElement && activeTool === 'terminal' ? (
        <TerminalRail sessionId={sessionId} slotElement={contentSlotElement} />
      ) : null}
      {contentSlotElement && activeTool === 'browser' ? (
        <BrowserRail slotElement={contentSlotElement} onClose={onClose} />
      ) : null}
    </div>,
    slotElement
  )
}

export function ThreadWorkspaceTools({ sessionId }: { sessionId: string }): React.JSX.Element {
  const { data: artifacts = [] } = useAgentArtifacts(sessionId)
  const {
    isOpen: isRightRailOpen,
    setIsOpen: setRightRailOpen,
    setHasContent: setHasRightRailContent,
    slotElement: rightRailSlotElement
  } = useAppV2ShellRightRail()
  const {
    isOpen: isBottomDrawerOpen,
    setIsOpen: setBottomDrawerOpen,
    setHasContent: setHasBottomDrawerContent,
    slotElement: bottomDrawerSlotElement
  } = useAppV2ShellBottomDrawer()
  const [activeTool, setActiveTool] = useState<WorkspaceTool | null>(null)
  const [activeBottomTool, setActiveBottomTool] = useState<BottomDrawerTool>('terminal')

  useEffect(() => {
    setHasRightRailContent(true)
    setHasBottomDrawerContent(true)
    return () => {
      setHasRightRailContent(false)
      setHasBottomDrawerContent(false)
    }
  }, [setHasBottomDrawerContent, setHasRightRailContent])

  useEffect(() => {
    const browser = window.tiaStudio?.browser
    if (!browser) return
    return browser.onRequestOpen((request) => {
      if (request.sessionId && request.sessionId !== sessionId) return
      setActiveTool('browser')
      setRightRailOpen(true)
    })
  }, [sessionId, setRightRailOpen])

  const selectTool = useCallback(
    (tool: WorkspaceTool): void => {
      setActiveTool(tool)
      setRightRailOpen(true)
    },
    [setRightRailOpen]
  )

  const closeRightRail = useCallback((): void => {
    setRightRailOpen(false)
  }, [setRightRailOpen])

  return (
    <>
      {isRightRailOpen && activeTool ? (
        <WorkspaceToolPanel
          sessionId={sessionId}
          activeTool={activeTool}
          slotElement={rightRailSlotElement}
          artifactCount={artifacts.length}
          onSelect={selectTool}
          onClose={closeRightRail}
        />
      ) : null}
      {isRightRailOpen && !activeTool ? (
        <WorkspaceToolEmptyState
          slotElement={rightRailSlotElement}
          onSelect={selectTool}
          onClose={closeRightRail}
        />
      ) : null}
      {isBottomDrawerOpen ? (
        <WorkspaceBottomDrawerPanel
          sessionId={sessionId}
          activeTool={activeBottomTool}
          slotElement={bottomDrawerSlotElement}
          onSelect={setActiveBottomTool}
          onClose={() => setBottomDrawerOpen(false)}
        />
      ) : null}
    </>
  )
}

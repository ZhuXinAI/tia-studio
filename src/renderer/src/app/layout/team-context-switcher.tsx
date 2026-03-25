import { ChevronDown, Folder } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'
import {
  listTeamWorkspaces,
  type TeamWorkspaceRecord
} from '../../features/team/team-workspaces-query'

export function TeamContextSwitcher(): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const [workspaces, setWorkspaces] = useState<TeamWorkspaceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true

    void listTeamWorkspaces()
      .then((nextWorkspaces) => {
        if (!active) {
          return
        }

        setWorkspaces(nextWorkspaces)
      })
      .catch(() => {
        if (!active) {
          return
        }

        setWorkspaces([])
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current || !(event.target instanceof Node)) {
        return
      }

      if (!containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === params.workspaceId) ?? null
  const selectedWorkspaceLabel = selectedWorkspace?.name?.trim()
  const selectedWorkspacePath = selectedWorkspace?.rootPath?.trim() || null

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-md flex-1">
      <button
        type="button"
        className={cn(
          'no-drag group flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50',
          '[border-color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] hover:bg-[color:var(--surface-panel)]',
          isOpen &&
            'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-panel)] shadow-[0_16px_40px_-30px_rgba(15,23,42,0.42)]'
        )}
        aria-label={t('appShell.teamSwitcher.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen((currentState) => !currentState)
        }}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border [border-color:var(--surface-border)] bg-[color:var(--surface-panel)] text-foreground transition-colors">
          <Folder className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[10px] tracking-[0.18em] uppercase">
            {t('appShell.teamSwitcher.label')}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold">
            {selectedWorkspaceLabel && selectedWorkspaceLabel.length > 0
              ? selectedWorkspaceLabel
              : isLoading
                ? t('appShell.teamSwitcher.loading')
                : t('appShell.teamSwitcher.fallback')}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground ml-auto size-4 shrink-0 transition-transform transition-opacity',
            isOpen ? 'rotate-180 opacity-100' : 'opacity-60 group-hover:opacity-100'
          )}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-full min-w-[320px] rounded-[24px] border border-[color:var(--surface-border-strong)] bg-[color:var(--surface-panel-strong)] p-3 text-card-foreground shadow-[0_26px_60px_-34px_rgba(15,23,42,0.52)] backdrop-blur-xl">
          <div className="space-y-3">
            <div className="rounded-2xl border [border-color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-active)] text-foreground">
                  <Folder className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
                    {t('appShell.teamSwitcher.label')}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {selectedWorkspaceLabel && selectedWorkspaceLabel.length > 0
                      ? selectedWorkspaceLabel
                      : isLoading
                        ? t('appShell.teamSwitcher.loading')
                        : t('appShell.teamSwitcher.fallback')}
                  </p>
                  {selectedWorkspacePath ? (
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {selectedWorkspacePath}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl bg-[color:var(--surface-panel-soft)] p-1.5">
              {workspaces.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-xs">
                  {t('appShell.teamSwitcher.empty')}
                </p>
              ) : (
                workspaces.map((workspace) => {
                  const isSelected = workspace.id === params.workspaceId

                  return (
                    <button
                      key={workspace.id}
                      type="button"
                      title={workspace.rootPath}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow]',
                        'hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-panel)]',
                        isSelected &&
                          'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-panel-strong)] shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)]'
                      )}
                      onClick={() => {
                        setIsOpen(false)
                        navigate(`/team/${workspace.id}`)
                      }}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border [border-color:var(--surface-border)] bg-[color:var(--surface-panel)] text-foreground">
                        <Folder className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {workspace.name}
                      </span>
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          isSelected ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      />
                    </button>
                  )
                })
              )}
            </div>

            <div className="border-t border-[color:var(--surface-border)] pt-3">
              <Button
                type="button"
                size="sm"
                className="w-full justify-start rounded-xl"
                onClick={() => {
                  setIsOpen(false)
                  navigate(location.pathname, {
                    state: {
                      createWorkspace: true
                    }
                  })
                }}
              >
                {t('appShell.teamSwitcher.createAction')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

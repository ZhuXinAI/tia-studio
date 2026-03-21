import { ChevronDown, Folder } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'
import { listTeamWorkspaces, type TeamWorkspaceRecord } from '../../features/team/team-workspaces-query'

export function TeamContextSwitcher(): React.JSX.Element {
  const { t } = useTranslation()
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

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === params.workspaceId) ?? null
  const selectedWorkspaceLabel = selectedWorkspace?.name?.trim()

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-md flex-1">
      <p className="text-muted-foreground px-1 text-[10px] tracking-[0.18em] uppercase">
        {t('appShell.teamSwitcher.label')}
      </p>
      <button
        type="button"
        className="no-drag group hover:bg-accent/40 focus-visible:ring-ring/50 mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left outline-none transition-colors focus-visible:ring-[3px]"
        aria-label={t('appShell.teamSwitcher.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen((currentState) => !currentState)
        }}
      >
        <Folder className="size-4 shrink-0" />
        <span className="truncate text-sm font-semibold">
          {selectedWorkspaceLabel && selectedWorkspaceLabel.length > 0
            ? selectedWorkspaceLabel
            : isLoading
              ? t('appShell.teamSwitcher.loading')
              : t('appShell.teamSwitcher.fallback')}
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground ml-auto size-4 shrink-0 transition-transform transition-opacity',
            isOpen ? 'translate-y-px opacity-100' : 'opacity-60 group-hover:opacity-100'
          )}
        />
      </button>

      {isOpen ? (
        <div className="bg-card text-card-foreground border-border absolute left-0 top-full z-20 mt-2 w-full min-w-[280px] rounded-xl border p-3 shadow-xl">
          <div className="space-y-1">
            {workspaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                {t('appShell.teamSwitcher.empty')}
              </p>
            ) : (
              workspaces.map((workspace) => {
                const isSelected = workspace.id === params.workspaceId

                return (
                  <button
                    key={workspace.id}
                    type="button"
                    className={cn(
                      'hover:bg-accent/60 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                      isSelected && 'bg-accent text-accent-foreground'
                    )}
                    onClick={() => {
                      setIsOpen(false)
                      navigate(`/team/${workspace.id}`)
                    }}
                  >
                    <Folder className="size-4 shrink-0" />
                    <span className="truncate">{workspace.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

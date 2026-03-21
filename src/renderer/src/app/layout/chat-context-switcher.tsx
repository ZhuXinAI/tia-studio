import { Bot, ChevronDown } from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'
import { listAssistants, type AssistantRecord } from '../../features/assistants/assistants-query'

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function ChatContextSwitcher(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [assistantSearchQuery, setAssistantSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const deferredAssistantSearchQuery = useDeferredValue(assistantSearchQuery)
  const normalizedAssistantSearchQuery = normalizeSearchValue(deferredAssistantSearchQuery)

  useEffect(() => {
    let active = true

    void listAssistants()
      .then((nextAssistants) => {
        if (!active) {
          return
        }

        setAssistants(nextAssistants)
      })
      .catch(() => {
        if (!active) {
          return
        }

        setAssistants([])
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

  useEffect(() => {
    if (!isOpen) {
      setAssistantSearchQuery('')
    }
  }, [isOpen])

  const selectedAssistant =
    assistants.find((assistant) => assistant.id === params.assistantId) ?? null
  const selectedAssistantLabel = selectedAssistant?.name?.trim()

  const filteredAssistants =
    normalizedAssistantSearchQuery.length === 0
      ? assistants
      : assistants.filter((assistant) =>
          normalizeSearchValue(assistant.name).includes(normalizedAssistantSearchQuery)
        )

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-md flex-1">
      <button
        type="button"
        className={cn(
          'no-drag group hover:bg-accent/40 focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-[3px]'
        )}
        aria-label={t('appShell.chatSwitcher.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen((currentState) => !currentState)
        }}
      >
        <Bot className="size-4 shrink-0" />
        <span className="text-muted-foreground shrink-0 text-[10px] tracking-[0.18em] uppercase">
          {t('appShell.chatSwitcher.label')}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">/</span>
        <span className="truncate text-sm font-semibold">
          {selectedAssistantLabel && selectedAssistantLabel.length > 0
            ? selectedAssistantLabel
            : isLoading
              ? t('appShell.chatSwitcher.loading')
              : t('appShell.chatSwitcher.fallback')}
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
          <div className="space-y-3">
            <Input
              autoFocus
              value={assistantSearchQuery}
              onChange={(event) => {
                setAssistantSearchQuery(event.target.value)
              }}
              placeholder={t('appShell.chatSwitcher.searchPlaceholder')}
              aria-label={t('appShell.chatSwitcher.searchAriaLabel')}
            />

            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {filteredAssistants.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">
                  {t('appShell.chatSwitcher.empty')}
                </p>
              ) : (
                filteredAssistants.map((assistant) => {
                  const isSelected = assistant.id === params.assistantId

                  return (
                    <button
                      key={assistant.id}
                      type="button"
                      className={cn(
                        'hover:bg-accent/60 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                        isSelected && 'bg-accent text-accent-foreground'
                      )}
                      onClick={() => {
                        setIsOpen(false)
                        navigate(`/chat/${assistant.id}`)
                      }}
                    >
                      <Bot className="size-4 shrink-0" />
                      <span className="truncate">{assistant.name}</span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/claws', {
                    state: {
                      assistantDialog: 'create'
                    }
                  })
                }}
              >
                {t('appShell.chatSwitcher.createAction')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/claws')
                }}
              >
                {t('appShell.chatSwitcher.manageAction')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

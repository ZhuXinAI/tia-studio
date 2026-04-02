import { Bot, ChevronDown, Search } from 'lucide-react'
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

function getAssistantSecondaryText(assistant: AssistantRecord | null): string | null {
  if (!assistant) {
    return null
  }

  const description = assistant.description.trim()
  return description.length > 0 ? description : null
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
  const selectedAssistantSecondaryText = getAssistantSecondaryText(selectedAssistant)

  const filteredAssistants =
    normalizedAssistantSearchQuery.length === 0
      ? assistants
      : assistants.filter((assistant) =>
          normalizeSearchValue(assistant.name).includes(normalizedAssistantSearchQuery)
        )
  const createAcpActionLabel = t('appShell.chatSwitcher.createAcpAction', {
    defaultValue: 'Create ACP Agent'
  })
  const createTiaActionLabel = t('appShell.chatSwitcher.createTiaAction', {
    defaultValue: 'Create TIA Agent (Advanced)'
  })

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
        aria-label={t('appShell.chatSwitcher.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen((currentState) => !currentState)
        }}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border [border-color:var(--surface-border)] bg-[color:var(--surface-panel)] text-foreground transition-colors">
          <Bot className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[10px] tracking-[0.18em] uppercase">
            {t('appShell.chatSwitcher.label')}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold">
            {selectedAssistantLabel && selectedAssistantLabel.length > 0
              ? selectedAssistantLabel
              : isLoading
                ? t('appShell.chatSwitcher.loading')
                : t('appShell.chatSwitcher.fallback')}
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
                  <Bot className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
                    {t('appShell.chatSwitcher.label')}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {selectedAssistantLabel && selectedAssistantLabel.length > 0
                      ? selectedAssistantLabel
                      : isLoading
                        ? t('appShell.chatSwitcher.loading')
                        : t('appShell.chatSwitcher.fallback')}
                  </p>
                  {selectedAssistantSecondaryText ? (
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {selectedAssistantSecondaryText}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={assistantSearchQuery}
                className="pl-9"
                onChange={(event) => {
                  setAssistantSearchQuery(event.target.value)
                }}
                placeholder={t('appShell.chatSwitcher.searchPlaceholder')}
                aria-label={t('appShell.chatSwitcher.searchAriaLabel')}
              />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl bg-[color:var(--surface-panel-soft)] p-1.5">
              {filteredAssistants.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-xs">
                  {t('appShell.chatSwitcher.empty')}
                </p>
              ) : (
                filteredAssistants.map((assistant) => {
                  const isSelected = assistant.id === params.assistantId
                  const secondaryText = getAssistantSecondaryText(assistant)

                  return (
                    <button
                      key={assistant.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow]',
                        'hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-panel)]',
                        isSelected &&
                          'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-panel-strong)] shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)]'
                      )}
                      onClick={() => {
                        setIsOpen(false)
                        navigate(`/chat/${assistant.id}`)
                      }}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border [border-color:var(--surface-border)] bg-[color:var(--surface-panel)] text-foreground">
                        <Bot className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {assistant.name}
                        </span>
                        {secondaryText ? (
                          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                            {secondaryText}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          isSelected
                            ? 'bg-primary'
                            : assistant.enabled
                              ? 'bg-emerald-500/70'
                              : 'bg-muted-foreground/30'
                        )}
                      />
                    </button>
                  )
                })
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-[color:var(--surface-border)] pt-3">
              <Button
                type="button"
                size="sm"
                className="w-full justify-start rounded-xl"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/claws', {
                    state: {
                      assistantDialog: 'create',
                      assistantCreatePath: 'external-acp'
                    }
                  })
                }}
              >
                {createAcpActionLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start rounded-xl"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/claws', {
                    state: {
                      assistantDialog: 'create',
                      assistantCreatePath: 'tia'
                    }
                  })
                }}
              >
                {createTiaActionLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start rounded-xl"
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

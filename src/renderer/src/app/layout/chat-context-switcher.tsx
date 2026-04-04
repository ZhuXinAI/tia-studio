import { Bot, ChevronDown, Search } from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'
import {
  useAssistants,
  type AssistantRecord
} from '../../features/assistants/assistants-query'
import {
  getAssistantCollectionTab,
  type AssistantCollectionTab
} from '../../features/assistants/assistant-origin'
import { listInstalledLocalAcpAgents } from '../../features/threads/local-acp-agents-query'

const AUTO_LOCAL_ACP_AGENT_KEY = '__tiaAutoLocalAcpAgentKey'

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function readAutoLocalAcpAgentKey(
  workspaceConfig: Record<string, unknown> | null | undefined
): string | null {
  const value = workspaceConfig?.[AUTO_LOCAL_ACP_AGENT_KEY]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
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
  const { data: assistants = [], isLoading } = useAssistants()
  const [isOpen, setIsOpen] = useState(false)
  const [assistantSearchQuery, setAssistantSearchQuery] = useState('')
  const [activeAssistantTab, setActiveAssistantTab] = useState<AssistantCollectionTab>('acp')
  const [installedLocalAcpAgentKeys, setInstalledLocalAcpAgentKeys] = useState<Set<string>>(
    () => new Set<string>()
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const deferredAssistantSearchQuery = useDeferredValue(assistantSearchQuery)
  const normalizedAssistantSearchQuery = normalizeSearchValue(deferredAssistantSearchQuery)

  useEffect(() => {
    let active = true

    void listInstalledLocalAcpAgents()
      .then((nextAgents) => {
        if (active) {
          setInstalledLocalAcpAgentKeys(new Set(nextAgents.map((agent) => agent.key)))
        }
      })
      .catch(() => undefined)

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

  const visibleAssistants = assistants.filter((assistant) => {
    const autoLocalAcpAgentKey = readAutoLocalAcpAgentKey(assistant.workspaceConfig)
    return !autoLocalAcpAgentKey || installedLocalAcpAgentKeys.has(autoLocalAcpAgentKey)
  })
  const selectedAssistant =
    visibleAssistants.find((assistant) => assistant.id === params.assistantId) ?? null
  const selectedAssistantLabel = selectedAssistant?.name?.trim()
  const selectedAssistantSecondaryText = getAssistantSecondaryText(selectedAssistant)
  const selectedAssistantTab = selectedAssistant ? getAssistantCollectionTab(selectedAssistant) : null
  const acpAssistants = visibleAssistants.filter(
    (assistant) => getAssistantCollectionTab(assistant) === 'acp'
  )
  const tiaAssistants = visibleAssistants.filter(
    (assistant) => getAssistantCollectionTab(assistant) === 'tia'
  )

  useEffect(() => {
    if (!isOpen && selectedAssistantTab) {
      setActiveAssistantTab(selectedAssistantTab)
      return
    }

    if (activeAssistantTab === 'acp' && acpAssistants.length > 0) {
      return
    }

    if (activeAssistantTab === 'tia' && tiaAssistants.length > 0) {
      return
    }

    setActiveAssistantTab(acpAssistants.length > 0 ? 'acp' : 'tia')
  }, [acpAssistants.length, activeAssistantTab, isOpen, selectedAssistantTab, tiaAssistants.length])

  const filteredAssistants =
    normalizedAssistantSearchQuery.length === 0
      ? (activeAssistantTab === 'acp' ? acpAssistants : tiaAssistants)
      : (activeAssistantTab === 'acp' ? acpAssistants : tiaAssistants).filter((assistant) =>
          normalizeSearchValue(assistant.name).includes(normalizedAssistantSearchQuery)
        )
  const openAcpActionLabel = t('appShell.chatSwitcher.createAcpAction', {
    defaultValue: 'Open ACP Agents'
  })
  const createTiaActionLabel = t('appShell.chatSwitcher.createTiaAction', {
    defaultValue: 'Create TIA Agent'
  })
  const manageActionLabel = t('appShell.chatSwitcher.manageAction', {
    defaultValue: 'Manage Agents'
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

            <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--surface-panel-soft)] p-1">
              {([
                {
                  id: 'acp' as const,
                  count: acpAssistants.length,
                  label: 'ACP Agents'
                },
                {
                  id: 'tia' as const,
                  count: tiaAssistants.length,
                  label: 'TIA Agents'
                }
              ] satisfies Array<{
                id: AssistantCollectionTab
                count: number
                label: string
              }>).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                    activeAssistantTab === tab.id
                      ? 'bg-[color:var(--surface-panel)] text-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.45)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setActiveAssistantTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  <span className="rounded-full bg-[color:var(--surface-panel-strong)] px-2 py-0.5 text-[11px]">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl bg-[color:var(--surface-panel-soft)] p-1.5">
              {filteredAssistants.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-xs">
                  {activeAssistantTab === 'acp'
                    ? 'No ACP agents are available right now.'
                    : t('appShell.chatSwitcher.empty')}
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
                  navigate('/settings/agents', {
                    state: {
                      assistantTab: 'acp'
                    }
                  })
                }}
              >
                {openAcpActionLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start rounded-xl"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/settings/agents', {
                    state: {
                      assistantDialog: 'create',
                      assistantTab: 'tia'
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
                  navigate('/settings/agents')
                }}
              >
                {manageActionLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

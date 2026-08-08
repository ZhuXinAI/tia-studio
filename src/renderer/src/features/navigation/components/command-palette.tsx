import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Check,
  Clock3,
  Command,
  Folder,
  MessageSquarePlus,
  Search,
  Settings,
  Sparkles
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AgentSessionSnapshot } from '../../../../../shared/agent-runtime'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { cn } from '../../../lib/utils'
import { useTranslation } from '../../../i18n/use-app-translation'
import { useAgentSessions } from '../../threads/agent-sessions-query'
import { getThreadDisplayTitle } from '../../threads/thread-page-routing'
import { useWorkspaces } from '../../workspaces/workspaces-query'

type PaletteAction = {
  id: string
  label: string
  description: string
  keywords: string
  icon: LucideIcon
  href: string
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function sessionHref(session: AgentSessionSnapshot): string {
  return session.workspaceId
    ? `/workspaces/${session.workspaceId}/threads/${session.id}`
    : `/chat/${session.id}`
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const commandShortcut =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'
  const { data: workspaces = [] } = useWorkspaces()
  const { data: sessions = [] } = useAgentSessions()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const actions = useMemo<PaletteAction[]>(() => {
    const staticActions: PaletteAction[] = [
      {
        id: 'new-chat',
        label: t('commandPalette.newChat'),
        description: t('commandPalette.newChatDescription'),
        keywords: 'chat conversation thread compose',
        icon: MessageSquarePlus,
        href: '/chat/new'
      },
      {
        id: 'command-center',
        label: t('commandPalette.commandCenter'),
        description: t('commandPalette.commandCenterDescription'),
        keywords: 'operations runs approvals errors',
        icon: Command,
        href: '/command-center'
      },
      {
        id: 'memories',
        label: t('commandPalette.memories'),
        description: t('commandPalette.memoriesDescription'),
        keywords: 'memory context preferences notes',
        icon: BookOpen,
        href: '/memories'
      },
      {
        id: 'skills',
        label: t('commandPalette.skills'),
        description: t('commandPalette.skillsDescription'),
        keywords: 'skills extensions tools marketplace',
        icon: Sparkles,
        href: '/skills'
      },
      {
        id: 'automations',
        label: t('commandPalette.schedules'),
        description: t('commandPalette.schedulesDescription'),
        keywords: 'automation recurring cron schedule',
        icon: Clock3,
        href: '/automations'
      },
      {
        id: 'settings',
        label: t('commandPalette.settings'),
        description: t('commandPalette.settingsDescription'),
        keywords: 'preferences configuration models',
        icon: Settings,
        href: '/settings/general'
      }
    ]
    const workspaceActions = workspaces
      .filter((workspace) => !workspace.builtInKind)
      .map<PaletteAction>((workspace) => ({
        id: `workspace-${workspace.id}`,
        label: workspace.name,
        description: t('commandPalette.workspaceDescription'),
        keywords: `workspace ${workspace.rootPath}`,
        icon: Folder,
        href: `/chat/new?pwd=${encodeURIComponent(workspace.id)}`
      }))
    const threadActions = [...sessions]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 8)
      .map<PaletteAction>((session) => ({
        id: `thread-${session.id}`,
        label: getThreadDisplayTitle(session.title),
        description: t('commandPalette.threadDescription', { model: session.modelId }),
        keywords: `${session.workspacePath} ${session.modelId}`,
        icon: MessageSquarePlus,
        href: sessionHref(session)
      }))
    return [...staticActions, ...workspaceActions, ...threadActions]
  }, [sessions, t, workspaces])

  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return actions
    return actions.filter((action) =>
      `${action.label} ${action.description} ${action.keywords}`.toLowerCase().includes(normalized)
    )
  }, [actions, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
  }, [open])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(filteredActions.length - 1, 0)))
  }, [filteredActions.length])

  function runAction(action: PaletteAction | undefined): void {
    if (!action) return
    onOpenChange(false)
    navigate(action.href)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % Math.max(filteredActions.length, 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(
        (current) =>
          (current - 1 + Math.max(filteredActions.length, 1)) % Math.max(filteredActions.length, 1)
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runAction(filteredActions[activeIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('commandPalette.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('commandPalette.description')}</DialogDescription>
        <div className="flex items-center gap-3 border-b border-[color:var(--surface-border)] px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder')}
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
            aria-label={t('commandPalette.inputLabel')}
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            {t('commandPalette.escape')}
          </kbd>
        </div>
        <ScrollArea className="w-full [&>[data-radix-scroll-area-viewport]]:h-auto [&>[data-radix-scroll-area-viewport]]:max-h-[min(28rem,60vh)]">
          <div className="p-2" role="listbox" aria-label={t('commandPalette.title')}>
          {filteredActions.length ? (
            filteredActions.map((action, index) => {
              const Icon = action.icon
              const active = index === activeIndex
              return (
                <button
                  key={action.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
                    active
                      ? 'bg-[color:var(--surface-active)]'
                      : 'hover:bg-[color:var(--surface-muted)]'
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runAction(action)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)]">
                    <Icon className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{action.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                  {active ? <Check className="size-4 shrink-0 text-muted-foreground" /> : null}
                </button>
              )
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('commandPalette.noResults')}
            </p>
          )}
          </div>
        </ScrollArea>
        <div className="flex items-center justify-between border-t border-[color:var(--surface-border)] px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            {t('commandPalette.navigateHint')} · {t('commandPalette.openHint')}
          </span>
          <span className="flex items-center gap-1">
            <Command className="size-3" /> {commandShortcut} · {t('commandPalette.shortcutHint')}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

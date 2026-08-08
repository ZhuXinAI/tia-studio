import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Edit3, Globe2, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentMemory, SaveAgentMemoryInput } from '../../../../../shared/memory'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Switch } from '../../../components/ui/switch'
import { Textarea } from '../../../components/ui/textarea'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import { useWorkspaces } from '../../workspaces/workspaces-query'
import { useCreateMemory, useDeleteMemory, useMemories, useUpdateMemory } from '../memories-query'

type Draft = SaveAgentMemoryInput

function emptyDraft(workspaceId: string | null = null): Draft {
  return { workspaceId, title: '', content: '', enabled: true }
}

function formatDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

export function MemoriesPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { data: memories = [], isLoading, isFetching } = useMemories()
  const { data: workspaces = [] } = useWorkspaces()
  const createMutation = useCreateMemory()
  const updateMutation = useUpdateMemory()
  const deleteMutation = useDeleteMemory()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [workspaceFilter, setWorkspaceFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft())

  const workspaceNames = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces]
  )
  const filteredMemories = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return memories.filter((memory) => {
      const matchesWorkspace =
        workspaceFilter === 'all' ||
        (workspaceFilter === 'global'
          ? memory.workspaceId === null
          : memory.workspaceId === workspaceFilter)
      const matchesQuery =
        !normalized || `${memory.title} ${memory.content}`.toLowerCase().includes(normalized)
      return matchesWorkspace && matchesQuery
    })
  }, [memories, query, workspaceFilter])
  const selected = memories.find((memory) => memory.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId && filteredMemories[0]) setSelectedId(filteredMemories[0].id)
    if (selectedId && !filteredMemories.some((memory) => memory.id === selectedId)) {
      setSelectedId(filteredMemories[0]?.id ?? null)
    }
  }, [filteredMemories, selectedId])

  function beginEdit(memory?: AgentMemory): void {
    setDraft(
      memory
        ? {
            workspaceId: memory.workspaceId,
            title: memory.title,
            content: memory.content,
            enabled: memory.enabled
          }
        : emptyDraft(
            workspaceFilter === 'all' || workspaceFilter === 'global' ? null : workspaceFilter
          )
    )
    setEditingId(memory?.id ?? 'new')
  }

  async function save(): Promise<void> {
    try {
      if (editingId === 'new') {
        const created = await createMutation.mutateAsync(draft)
        setSelectedId(created.id)
      } else if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input: draft })
      }
      setEditingId(null)
      toast.success(t('memories.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('memories.saveFailed'))
    }
  }

  async function remove(memory: AgentMemory): Promise<void> {
    if (!window.confirm(t('memories.deleteConfirm', { title: memory.title }))) return
    try {
      await deleteMutation.mutateAsync(memory.id)
      setSelectedId(null)
      setEditingId(null)
      toast.success(t('memories.deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('memories.deleteFailed'))
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--surface-border)] px-6 py-5">
        <div>
          <p className="section-kicker">{t('memories.kicker')}</p>
          <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">
            {t('memories.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t('memories.description')}
          </p>
        </div>
        <Button type="button" onClick={() => beginEdit()}>
          <Plus className="size-4" /> {t('memories.new')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid min-h-full max-w-6xl gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-3 py-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t('memories.count', { count: memories.length })}
              </span>
              {isFetching ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {t('memories.syncing')}
                </span>
              ) : null}
            </div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('memories.search')}
            />
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t('memories.scope')}
              <select
                value={workspaceFilter}
                onChange={(event) => setWorkspaceFilter(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground"
              >
                <option value="all">{t('memories.allScopes')}</option>
                <option value="global">{t('memories.globalOnly')}</option>
                {workspaces
                  .filter((workspace) => !workspace.builtInKind)
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="space-y-1">
              {isLoading ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">{t('memories.loading')}</p>
              ) : null}
              {!isLoading && filteredMemories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--surface-border)] p-4 text-sm text-muted-foreground">
                  {t('memories.empty')}
                </div>
              ) : null}
              {filteredMemories.map((memory) => (
                <button
                  key={memory.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(memory.id)
                    setEditingId(null)
                  }}
                  className={cn(
                    'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                    selectedId === memory.id
                      ? 'border-foreground/20 bg-[color:var(--surface-active)]'
                      : 'border-transparent hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-muted)]',
                    !memory.enabled && 'opacity-60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {memory.workspaceId ? (
                      <BookOpen className="size-3.5 text-muted-foreground" />
                    ) : (
                      <Globe2 className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-medium">{memory.title}</span>
                  </div>
                  <p className="mt-1 truncate pl-5 text-xs text-muted-foreground">
                    {memory.workspaceId
                      ? (workspaceNames.get(memory.workspaceId) ?? t('memories.workspace'))
                      : t('memories.global')}
                  </p>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-5 shadow-[var(--surface-shadow)]">
            {editingId ? (
              <div className="mx-auto max-w-3xl space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-kicker">
                      {editingId === 'new' ? t('memories.create') : t('memories.edit')}
                    </p>
                    <h2 className="text-xl font-semibold">
                      {editingId === 'new' ? t('memories.new') : t('memories.edit')}
                    </h2>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingId(null)}
                    aria-label={t('memories.close')}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <label className="grid gap-1.5 text-sm font-medium">
                  {t('memories.titleField')}
                  <Input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    placeholder={t('memories.titlePlaceholder')}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  {t('memories.contentField')}
                  <Textarea
                    rows={12}
                    value={draft.content}
                    onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                    placeholder={t('memories.contentPlaceholder')}
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('memories.contentHint')}
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  {t('memories.scopeField')}
                  <select
                    value={draft.workspaceId ?? 'global'}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        workspaceId: event.target.value === 'global' ? null : event.target.value
                      })
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 font-normal"
                  >
                    <option value="global">{t('memories.global')}</option>
                    {workspaces
                      .filter((workspace) => !workspace.builtInKind)
                      .map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] p-3">
                  <div>
                    <p className="text-sm font-medium">{t('memories.enabled')}</p>
                    <p className="text-xs text-muted-foreground">{t('memories.enabledHint')}</p>
                  </div>
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
                    aria-label={t('memories.enabled')}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {editingId !== 'new' && selected ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void remove(selected)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-4" /> {t('memories.delete')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !draft.title.trim() || !draft.content.trim()}
                  >
                    <Save className="size-4" /> {saving ? t('memories.saving') : t('memories.save')}
                  </Button>
                </div>
              </div>
            ) : selected ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          selected.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                        )}
                      />
                      {selected.enabled ? t('memories.enabled') : 'Disabled'} ·{' '}
                      {selected.workspaceId
                        ? (workspaceNames.get(selected.workspaceId) ?? t('memories.workspace'))
                        : t('memories.global')}
                    </div>
                    <h2 className="mt-2 break-words text-2xl font-semibold">{selected.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('memories.updated', {
                        date: formatDate(selected.updatedAt, i18n.language)
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => beginEdit(selected)}>
                      <Edit3 className="size-4" /> {t('memories.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void remove(selected)}
                      aria-label={t('memories.delete')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <article className="whitespace-pre-wrap rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] p-5 text-sm leading-7">
                  {selected.content}
                </article>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="size-3.5 text-emerald-500" /> {t('memories.explicitControl')}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
                <BookOpen className="size-8 text-muted-foreground/60" />
                <h2 className="mt-4 text-lg font-semibold">{t('memories.readyTitle')}</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {t('memories.readyDescription')}
                </p>
                <Button className="mt-5" type="button" onClick={() => beginEdit()}>
                  <Plus className="size-4" /> {t('memories.createFirst')}
                </Button>
              </div>
            )}
          </main>
        </div>
      </div>
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Folder,
  FolderCog,
  LockKeyhole,
  Save,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'
import { pickDirectory } from '../../../lib/desktop-features'
import { cn } from '../../../lib/utils'
import { useAgentSessions } from '../../threads/agent-sessions-query'
import { useMemories } from '../../memories/memories-query'
import {
  useDeleteWorkspace,
  useUpdateWorkspace,
  useWorkspaces,
  type WorkspaceRecord
} from '../workspaces-query'

export function WorkspacesAdminPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { data: workspaces = [], isLoading } = useWorkspaces()
  const { data: sessions = [] } = useAgentSessions()
  const { data: memories = [] } = useMemories()
  const updateMutation = useUpdateWorkspace()
  const deleteMutation = useDeleteWorkspace()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')

  const selected = workspaces.find((workspace) => workspace.id === selectedId) ?? null
  const workspaceSessions = useMemo(
    () =>
      new Map(
        workspaces.map((workspace) => [
          workspace.id,
          sessions.filter((session) => session.workspaceId === workspace.id).length
        ])
      ),
    [sessions, workspaces]
  )
  const workspaceMemories = useMemo(
    () =>
      new Map(
        workspaces.map((workspace) => [
          workspace.id,
          memories.filter((memory) => memory.workspaceId === workspace.id).length
        ])
      ),
    [memories, workspaces]
  )

  useEffect(() => {
    if (selectedId || !workspaces[0]) return
    setSelectedId(workspaces[0].id)
  }, [selectedId, workspaces])

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setRootPath(selected.rootPath)
  }, [selected])

  function selectWorkspace(workspace: WorkspaceRecord): void {
    setSelectedId(workspace.id)
    setName(workspace.name)
    setRootPath(workspace.rootPath)
  }

  async function save(): Promise<void> {
    if (!selected || selected.builtInKind) return
    try {
      await updateMutation.mutateAsync({
        workspaceId: selected.id,
        input: { name: name.trim(), rootPath: rootPath.trim() }
      })
      toast.success(t('workspacesAdmin.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('workspacesAdmin.saveFailed'))
    }
  }

  async function chooseDirectory(): Promise<void> {
    const path = await pickDirectory()
    if (path) setRootPath(path)
  }

  async function remove(): Promise<void> {
    if (!selected || selected.builtInKind) return
    if (!window.confirm(t('workspacesAdmin.removeConfirm', { name: selected.name }))) {
      return
    }
    try {
      await deleteMutation.mutateAsync(selected.id)
      setSelectedId(null)
      toast.success(t('workspacesAdmin.removed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('workspacesAdmin.removeFailed'))
    }
  }

  return (
    <section className="w-full space-y-8">
      <header>
        <p className="section-kicker">{t('workspacesAdmin.kicker')}</p>
        <h1 className="settings-page-title">{t('workspacesAdmin.title')}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          {t('workspacesAdmin.description')}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary
          icon={<FolderCog className="size-4" />}
          label={t('workspacesAdmin.workspaces')}
          value={workspaces.length}
        />
        <Summary
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          label={t('workspacesAdmin.availablePaths')}
          value={workspaces.filter((workspace) => !workspace.isMissing).length}
        />
        <Summary
          icon={<LockKeyhole className="size-4 text-blue-500" />}
          label={t('workspacesAdmin.sharing')}
          value={t('workspacesAdmin.localOnly')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('workspacesAdmin.loading')}</p>
          ) : null}
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => selectWorkspace(workspace)}
              className={cn(
                'w-full rounded-xl border px-3 py-3 text-left',
                selected?.id === workspace.id
                  ? 'border-foreground/20 bg-[color:var(--surface-active)]'
                  : 'border-[color:var(--surface-border)] hover:bg-[color:var(--surface-muted)]'
              )}
            >
              <div className="flex items-center gap-2">
                <Folder className="size-4 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{workspace.name}</span>
              </div>
              <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">
                {workspace.rootPath}
              </p>
              <div className="mt-2 flex items-center justify-between pl-6 text-[11px] text-muted-foreground">
                <span>
                  {workspace.builtInKind
                    ? t('workspacesAdmin.builtIn')
                    : t('workspacesAdmin.threads', {
                        count: workspaceSessions.get(workspace.id) ?? 0
                      })}
                </span>
                {workspace.isMissing ? (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="size-3" /> {t('workspacesAdmin.missing')}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-6 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-5 shadow-[var(--surface-shadow)]">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="section-kicker">{t('workspacesAdmin.profile')}</p>
                  <h2 className="mt-1 text-xl font-semibold">{selected.name}</h2>
                </div>
                {selected.builtInKind ? (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {t('workspacesAdmin.protected')}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat
                  label={t('workspacesAdmin.threadCountLabel')}
                  value={
                    selected.builtInKind
                      ? sessions.filter((session) => session.workspaceId === null).length
                      : (workspaceSessions.get(selected.id) ?? 0)
                  }
                />
                <Stat
                  label={t('workspacesAdmin.scopedMemories')}
                  value={
                    selected.builtInKind
                      ? memories.filter((memory) => memory.workspaceId === null).length
                      : (workspaceMemories.get(selected.id) ?? 0)
                  }
                />
              </div>
              {selected.builtInKind ? (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-muted-foreground">
                  {t('workspacesAdmin.chatsProtected')}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="grid gap-1.5 text-sm font-medium">
                    {t('workspacesAdmin.displayName')}
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    {t('workspacesAdmin.rootPath')}
                    <div className="flex gap-2">
                      <Input
                        value={rootPath}
                        onChange={(event) => setRootPath(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void chooseDirectory()}
                      >
                        {t('workspacesAdmin.browse')}
                      </Button>
                    </div>
                  </label>
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void remove()}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-4" /> {t('workspacesAdmin.remove')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void save()}
                      disabled={updateMutation.isPending || !name.trim() || !rootPath.trim()}
                    >
                      <Save className="size-4" />
                      {updateMutation.isPending
                        ? t('workspacesAdmin.saving')
                        : t('workspacesAdmin.save')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t('workspacesAdmin.empty')}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-5">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">{t('workspacesAdmin.teamBoundary')}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t('workspacesAdmin.teamBoundaryDescription')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Summary({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: number | string
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-xl bg-[color:var(--surface-muted)] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

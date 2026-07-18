import { useEffect, useMemo, useState } from 'react'
import { Cable, Check, Download, Search, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { McpServersSettingsPage } from '../../settings/pages/mcp-servers-settings-page'
import { useWorkspaces } from '../../workspaces/workspaces-query'
import { useInstallMarketplaceSkill, useSkillMarketplace } from '../skills-query'

function formatInstalls(installs: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    installs
  )
}

export function SkillsPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'mcps' ? 'mcps' : 'skills'
  const { data: workspaces = [] } = useWorkspaces()
  const namedWorkspaces = workspaces.filter((workspace) => workspace.builtInKind !== 'chats')
  const [workspaceId, setWorkspaceId] = useState<string>(namedWorkspaces[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const { data: skills = [], isLoading } = useSkillMarketplace(workspaceId || undefined)
  const installMutation = useInstallMarketplaceSkill()
  useEffect(() => {
    if (!workspaceId && namedWorkspaces[0]) setWorkspaceId(namedWorkspaces[0].id)
  }, [namedWorkspaces, workspaceId])
  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? skills.filter((skill) =>
          `${skill.name} ${skill.slug} ${skill.source}`.toLowerCase().includes(normalized)
        )
      : skills
  }, [query, skills])

  async function install(skillId: string, scope: 'global' | 'workspace'): Promise<void> {
    try {
      await installMutation.mutateAsync({
        skillId,
        scope,
        ...(scope === 'workspace' && workspaceId ? { workspaceId } : {})
      })
      toast.success(
        scope === 'global' ? 'Installed for every TIA workspace' : 'Installed in this workspace'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Skill installation failed')
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="border-b border-[color:var(--surface-border)] px-7 pt-5">
        <div className="flex items-end justify-between gap-4 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Skills and MCPs</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Extend Pi with owned skill bundles and shared MCP servers.
            </p>
          </div>
        </div>
        <nav className="flex gap-6" aria-label="Extensions">
          {[
            ['skills', 'Skills', Sparkles],
            ['mcps', 'MCPs', Cable]
          ].map(([id, label, Icon]) => (
            <button
              key={id as string}
              type="button"
              onClick={() => setSearchParams(id === 'mcps' ? { tab: 'mcps' } : {})}
              className={cn(
                'flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors',
                activeTab === id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-4" /> {label as string}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === 'mcps' ? (
        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <McpServersSettingsPage embedded />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--surface-border)] px-7 py-4">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the top 20"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Workspace target
              <select
                className="h-9 max-w-[15rem] rounded-md border bg-background px-3 text-sm text-foreground"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Choose workspace</option>
                {namedWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-7 py-5">
            <div className="mx-auto max-w-5xl">
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Top skills on skills.sh · all time</span>
                <span>Complete bundles are copied into TIA-owned folders</span>
              </div>
              {isLoading ? (
                <p className="py-8 text-sm text-muted-foreground">Loading catalog…</p>
              ) : null}
              <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-border)] lg:grid-cols-2">
                {visibleSkills.map((skill) => (
                  <article
                    key={skill.id}
                    className="flex min-w-0 items-center gap-3 bg-[color:var(--surface-paper)] p-4"
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {skill.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-medium">{skill.name}</h2>
                        {skill.installedGlobal ? (
                          <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px]">
                            Global
                          </span>
                        ) : null}
                        {skill.installedWorkspace ? (
                          <span className="rounded-full bg-[color:var(--surface-active)] px-2 py-0.5 text-[10px]">
                            Workspace
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {skill.source} · {formatInstalls(skill.installs)} installs
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={installMutation.isPending || skill.installedGlobal}
                        onClick={() => void install(skill.id, 'global')}
                      >
                        {skill.installedGlobal ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Download className="size-3.5" />
                        )}{' '}
                        Global
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          !workspaceId || installMutation.isPending || skill.installedWorkspace
                        }
                        onClick={() => void install(skill.id, 'workspace')}
                      >
                        {skill.installedWorkspace ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Download className="size-3.5" />
                        )}{' '}
                        Workspace
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

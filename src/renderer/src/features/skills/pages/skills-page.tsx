import { useMemo, useState } from 'react'
import { Cable, Check, Download, RefreshCw, Search, Sparkles, Trash2, Upload } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { McpServersSettingsPage } from '../../settings/pages/mcp-servers-settings-page'
import {
  useInstallMarketplaceSkill,
  useRemoveMarketplaceSkill,
  useSkillMarketplace,
  useUpdateMarketplaceSkill
} from '../skills-query'
import { getVisibleMarketplaceSkills } from '../marketplace-visibility'
import { useTranslation } from '../../../i18n/use-app-translation'

function formatInstalls(installs: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    installs
  )
}

export function SkillsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'mcps' ? 'mcps' : 'skills'
  const [query, setQuery] = useState('')
  const { data: skills = [], isLoading, isFetching, refetch } = useSkillMarketplace()
  const installMutation = useInstallMarketplaceSkill()
  const updateMutation = useUpdateMarketplaceSkill()
  const removeMutation = useRemoveMarketplaceSkill()
  const visibleSkills = useMemo(() => getVisibleMarketplaceSkills(skills, query), [query, skills])

  async function install(skillId: string): Promise<void> {
    try {
      await installMutation.mutateAsync({ skillId })
      toast.success(t('skills.installSuccess'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('skills.installFailed'))
    }
  }

  async function update(skillId: string): Promise<void> {
    try {
      await updateMutation.mutateAsync({ skillId })
      toast.success('Skill updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Skill update failed')
    }
  }

  async function remove(skillId: string, name: string): Promise<void> {
    if (!window.confirm(`Remove “${name}” from TIA Studio?`)) return
    try {
      await removeMutation.mutateAsync({ skillId })
      toast.success('Skill removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Skill removal failed')
    }
  }

  const mutationPending =
    installMutation.isPending || updateMutation.isPending || removeMutation.isPending

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="border-b border-[color:var(--surface-border)] px-7 pt-5">
        <div className="flex items-end justify-between gap-4 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('skills.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('skills.description')}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> Refresh
          </Button>
        </div>
        <nav className="flex gap-6" aria-label={t('skills.extensionsLabel')}>
          {[
            ['skills', t('skills.skillsTab'), Sparkles],
            ['mcps', t('skills.mcpsTab'), Cable]
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
          <div className="border-b border-[color:var(--surface-border)] px-7 py-4">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('skills.searchPlaceholder')}
                className="pl-9"
              />
            </div>
          </div>

          <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-7 py-5">
            <div className="mx-auto max-w-5xl">
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t('skills.catalogLabel')} · {visibleSkills.length} shown
                </span>
                <span>
                  {skills.filter((skill) => skill.installedGlobal).length} installed ·{' '}
                  {t('skills.globalScope')}
                </span>
              </div>
              {isLoading ? (
                <p className="py-8 text-sm text-muted-foreground">{t('skills.loading')}</p>
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
                            {t('skills.installed')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {skill.source} ·{' '}
                        {t('skills.installs', {
                          formattedCount: formatInstalls(skill.installs, i18n.language)
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={mutationPending || skill.installedGlobal}
                      onClick={() => void install(skill.id)}
                    >
                      {skill.installedGlobal ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Download className="size-3.5" />
                      )}{' '}
                      {skill.installedGlobal ? t('skills.installed') : t('skills.install')}
                    </Button>
                    {skill.installedGlobal ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          disabled={mutationPending}
                          onClick={() => void update(skill.id)}
                        >
                          <Upload className="size-3.5" /> Update
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={mutationPending}
                          onClick={() => void remove(skill.id, skill.name)}
                          aria-label={`Remove ${skill.name}`}
                          title={`Remove ${skill.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : null}
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

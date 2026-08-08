import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { toast } from 'sonner'
import type { PermissionRule } from '../../../../../shared/permission-rules'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { toErrorMessage } from '../../threads/thread-page-routing'
import { getPermissionRules, revokePermissionRule } from '../permissions/permission-rules-query'
import { SettingsContent } from './settings-content'
import { useTranslation } from '../../../i18n/use-app-translation'

const pageSize = 10

function formatTimestamp(value: string | undefined, locale: string, never: string): string {
  return value ? new Date(value).toLocaleString(locale) : never
}

export function PermissionsSettingsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const workspacePaths = useMemo(
    () => Array.from(new Set(rules.map((rule) => rule.workspacePath))).sort(),
    [rules]
  )
  const filteredRules = useMemo(
    () =>
      rules.filter((rule) => {
        const matchesWorkspace = !workspacePath || rule.workspacePath === workspacePath
        const normalized = query.trim().toLowerCase()
        const matchesQuery =
          !normalized ||
          `${rule.argvPrefix.join(' ')} ${rule.rationale} ${rule.tool}`
            .toLowerCase()
            .includes(normalized)
        return matchesWorkspace && matchesQuery
      }),
    [query, rules, workspacePath]
  )
  const totalPages = Math.max(1, Math.ceil(filteredRules.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visibleRules = filteredRules.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const firstVisibleRule = filteredRules.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastVisibleRule = Math.min(currentPage * pageSize, filteredRules.length)

  const load = useCallback(async () => {
    try {
      setRules(await getPermissionRules())
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [query, workspacePath])

  async function revoke(rule: PermissionRule): Promise<void> {
    setRevoking(rule.id)
    try {
      await revokePermissionRule(rule.id)
      setRules((current) => current.filter((item) => item.id !== rule.id))
      toast.success(t('settings.permissions.revokeSuccess'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <SettingsContent>
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('settings.permissions.title')}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
              {t('settings.permissions.description')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-3.5" /> {t('common.actions.refresh')}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SecuritySummary
          icon={<ShieldCheck className="size-4 text-emerald-500" />}
          label={t('settings.permissions.rememberedRules')}
          value={rules.length}
        />
        <SecuritySummary
          icon={<Activity className="size-4 text-blue-500" />}
          label={t('settings.permissions.workspacesCovered')}
          value={new Set(rules.map((rule) => rule.workspacePath)).size}
        />
        <SecuritySummary
          icon={<Clock3 className="size-4 text-amber-500" />}
          label={t('settings.permissions.usedOnce')}
          value={rules.filter((rule) => rule.lastUsedAt).length}
        />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">{t('settings.permissions.askFirst')}</p>
          <p className="mt-1 text-muted-foreground">{t('settings.permissions.askFirstDescription')}</p>
          <NavLink
            to="/command-center"
            className="mt-2 inline-flex text-xs font-medium underline underline-offset-4"
          >
            {t('settings.permissions.pendingApprovalsLink')}
          </NavLink>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" /> {t('settings.permissions.approvalsTitle')}
              </CardTitle>
              <CardDescription>{t('settings.permissions.approvalsDescription')}</CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">{filteredRules.length} {t('settings.permissions.visible')}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">{t('settings.permissions.loading')}</p>
          ) : null}
          {!loading && rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('settings.permissions.empty')}</p>
          ) : null}
          {!loading && rules.length > 0 ? (
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--surface-border)] pb-3">
              <label className="relative grid min-w-56 flex-1 gap-1.5 text-xs font-medium text-muted-foreground">
                {t('settings.permissions.searchCommands')}
                <Search className="pointer-events-none absolute bottom-2.5 left-2.5 size-3.5" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('settings.permissions.searchPlaceholder')}
                  className="h-9 pl-8 text-sm font-normal"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                {t('settings.permissions.workspaceFilter')}
                <select
                  value={workspacePath}
                  onChange={(event) => setWorkspacePath(event.target.value)}
                  className="h-9 min-w-56 max-w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">{t('settings.permissions.allWorkspaces')}</option>
                  {workspacePaths.map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                {t('settings.permissions.results', {
                  from: firstVisibleRule,
                  to: lastVisibleRule,
                  total: filteredRules.length
                })}
              </p>
            </div>
          ) : null}
          {visibleRules.map((rule) => (
            <div
              key={rule.id}
              className="border-border flex items-start gap-4 rounded-lg border p-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <code className="bg-muted block w-fit max-w-full overflow-x-auto rounded px-2 py-1 text-xs">
                  {rule.argvPrefix.join(' ')}
                </code>
                <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-foreground">{t('settings.permissions.decision')}: </dt>
                    <dd
                      className={`inline rounded-full px-2 py-0.5 text-[11px] ${rule.decision === 'deny' ? 'bg-red-500/10 text-red-600' : rule.decision === 'ask' ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}
                    >
                      {rule.decision}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {t('settings.permissions.fields.scope')}:{' '}
                    </dt>
                    <dd className="inline break-all">{rule.workspacePath}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {t('settings.permissions.fields.source')}:{' '}
                    </dt>
                    <dd className="inline">{t(`settings.permissions.origins.${rule.origin}`)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {t('settings.permissions.fields.lastUsed')}:{' '}
                    </dt>
                    <dd className="inline">
                      {formatTimestamp(
                        rule.lastUsedAt,
                        i18n.language,
                        t('settings.permissions.never')
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {t('settings.permissions.fields.rationale')}:{' '}
                    </dt>
                    <dd className="inline">{rule.rationale}</dd>
                  </div>
                </dl>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('settings.permissions.revokeAriaLabel', {
                  command: rule.argvPrefix.join(' ')
                })}
                disabled={revoking === rule.id}
                onClick={() => void revoke(rule)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {!loading && filteredRules.length > 0 ? (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-3.5" />
                {t('settings.permissions.previous')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('settings.permissions.page', { current: currentPage, total: totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {t('settings.permissions.next')}
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </SettingsContent>
  )
}

function SecuritySummary({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: number
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

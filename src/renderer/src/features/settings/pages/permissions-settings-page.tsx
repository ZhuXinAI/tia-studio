import { ChevronLeft, ChevronRight, ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [page, setPage] = useState(1)

  const workspacePaths = useMemo(
    () => Array.from(new Set(rules.map((rule) => rule.workspacePath))).sort(),
    [rules]
  )
  const filteredRules = useMemo(
    () => rules.filter((rule) => !workspacePath || rule.workspacePath === workspacePath),
    [rules, workspacePath]
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
  }, [workspacePath])

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
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.permissions.title')}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          {t('settings.permissions.description')}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> {t('settings.permissions.approvalsTitle')}
          </CardTitle>
          <CardDescription>{t('settings.permissions.approvalsDescription')}</CardDescription>
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

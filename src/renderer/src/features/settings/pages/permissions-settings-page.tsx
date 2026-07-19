import { ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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

function formatTimestamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : 'Never'
}

export function PermissionsSettingsPage(): React.JSX.Element {
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

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

  async function revoke(rule: PermissionRule): Promise<void> {
    setRevoking(rule.id)
    try {
      await revokePermissionRule(rule.id)
      setRules((current) => current.filter((item) => item.id !== rule.id))
      toast.success('Permission rule revoked')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <SettingsContent>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Command permissions</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Review command prefixes that TIA Studio may run without asking again. Approvals are scoped
          to one workspace and can be revoked at any time.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Workspace approvals
          </CardTitle>
          <CardDescription>
            Credential hard blocks still apply, including when a command matches an approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-muted-foreground text-sm">Loading permissions…</p> : null}
          {!loading && rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">No remembered command approvals.</p>
          ) : null}
          {rules.map((rule) => (
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
                    <dt className="inline font-medium text-foreground">Scope: </dt>
                    <dd className="inline break-all">{rule.workspacePath}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Source: </dt>
                    <dd className="inline">{rule.origin}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Last used: </dt>
                    <dd className="inline">{formatTimestamp(rule.lastUsedAt)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Rationale: </dt>
                    <dd className="inline">{rule.rationale}</dd>
                  </div>
                </dl>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Revoke ${rule.argvPrefix.join(' ')}`}
                disabled={revoking === rule.id}
                onClick={() => void revoke(rule)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </SettingsContent>
  )
}

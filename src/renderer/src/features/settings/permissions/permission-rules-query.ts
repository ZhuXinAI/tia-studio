import type { PermissionRule } from '../../../../../shared/permission-rules'
import { createApiClient } from '../../../lib/api-client'

const api = createApiClient()

export function getPermissionRules(): Promise<PermissionRule[]> {
  return api.get('/v1/settings/permission-rules')
}

export function revokePermissionRule(ruleId: string): Promise<void> {
  return api.delete(`/v1/settings/permission-rules/${encodeURIComponent(ruleId)}`)
}

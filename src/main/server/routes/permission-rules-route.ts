import type { Hono } from 'hono'
import type { PermissionRulesRepository } from '../../persistence/repos/permission-rules-repo'

export function registerPermissionRulesRoute(
  app: Hono,
  options: { permissionRulesRepo: PermissionRulesRepository }
): void {
  app.get('/v1/settings/permission-rules', async (context) => {
    const workspacePath = context.req.query('workspacePath')?.trim()
    return context.json(await options.permissionRulesRepo.list(workspacePath || undefined))
  })

  app.delete('/v1/settings/permission-rules/:ruleId', async (context) => {
    const deleted = await options.permissionRulesRepo.delete(context.req.param('ruleId'))
    return deleted
      ? context.body(null, 204)
      : context.json({ error: 'Permission rule not found' }, 404)
  })
}

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerPermissionRulesRoute } from './permission-rules-route'

describe('permission rules settings route', () => {
  it('lists rules and revokes one', async () => {
    const repository = {
      list: vi.fn(async () => [{ id: 'rule-1' }]),
      delete: vi.fn(async () => true)
    }
    const app = new Hono()
    registerPermissionRulesRoute(app, { permissionRulesRepo: repository as never })

    const response = await app.request('http://localhost/v1/settings/permission-rules')
    expect(await response.json()).toEqual([{ id: 'rule-1' }])
    expect(repository.list).toHaveBeenCalledWith(undefined)

    const deleted = await app.request('http://localhost/v1/settings/permission-rules/rule-1', {
      method: 'DELETE'
    })
    expect(deleted.status).toBe(204)
    expect(repository.delete).toHaveBeenCalledWith('rule-1')
  })
})

import type { Hono } from 'hono'

export function registerHealthRoute(app: Hono): void {
  app.get('/v1/health', (context) => {
    return context.json({ ok: true })
  })
}

import type { Hono } from 'hono'
import type { HealthDependencies, HealthSnapshot } from '../../../shared/health'

export function registerHealthRoute(
  app: Hono,
  options: { getDependencies?: () => Promise<HealthDependencies> } = {}
): void {
  app.get('/v1/health', async (context) => {
    const memory = process.memoryUsage()
    let dependencies: HealthDependencies | undefined
    if (options.getDependencies) {
      try {
        dependencies = await options.getDependencies()
      } catch {
        // Keep bridge health available if an optional dependency signal fails.
        dependencies = undefined
      }
    }
    const snapshot: HealthSnapshot = {
      ok: true,
      status: 'ok',
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal
      },
      ...(dependencies ? { dependencies } : {})
    }
    return context.json(snapshot)
  })
}

import type { Hono } from 'hono'

type RegisterBuiltInBrowserRouteOptions = {
  onShowBuiltInBrowserWindow?: () => Promise<void> | void
}

export function registerBuiltInBrowserRoute(
  app: Hono,
  options: RegisterBuiltInBrowserRouteOptions
): void {
  app.post('/v1/built-in-browser/show', async (context) => {
    if (!options.onShowBuiltInBrowserWindow) {
      return context.json(
        {
          ok: false,
          error: 'Built-in browser window control is unavailable'
        },
        503
      )
    }

    try {
      await options.onShowBuiltInBrowserWindow()
      return context.json({ ok: true })
    } catch (error) {
      return context.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to bring the built-in browser window forward'
        },
        500
      )
    }
  })
}

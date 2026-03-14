import type { Hono } from 'hono'
import type { WebSearchSettingsRepository } from '../../persistence/repos/web-search-settings-repo'
import { webSearchEngines, type WebSearchEngine } from '../../web-search/web-search-engine'
import { updateWebSearchSettingsSchema } from '../validators/web-search-validator'

type RegisterWebSearchSettingsRouteOptions = {
  webSearchSettingsRepo: WebSearchSettingsRepository
  onShowBuiltInBrowserChange?: (show: boolean) => Promise<void> | void
}

function parseJsonBodyErrorResponse(): {
  ok: false
  error: string
} {
  return {
    ok: false,
    error: 'Invalid JSON body'
  }
}

function toWebSearchResponse(input: {
  defaultEngine: WebSearchEngine
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
  showBuiltInBrowser: boolean
}): {
  defaultEngine: WebSearchEngine
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
  showBuiltInBrowser: boolean
  availableEngines: typeof webSearchEngines
} {
  return {
    defaultEngine: input.defaultEngine,
    keepBrowserWindowOpen: input.keepBrowserWindowOpen,
    showBrowser: input.showBrowser,
    showBuiltInBrowser: input.showBuiltInBrowser,
    availableEngines: webSearchEngines
  }
}

export function registerWebSearchSettingsRoute(
  app: Hono,
  options: RegisterWebSearchSettingsRouteOptions
): void {
  app.get('/v1/settings/web-search', async (context) => {
    const [defaultEngine, keepBrowserWindowOpen, showBrowser, showBuiltInBrowser] =
      await Promise.all([
        options.webSearchSettingsRepo.getDefaultEngine(),
        options.webSearchSettingsRepo.getKeepBrowserWindowOpen(),
        options.webSearchSettingsRepo.getShowBrowser(),
        options.webSearchSettingsRepo.getShowBuiltInBrowser()
      ])
    return context.json(
      toWebSearchResponse({
        defaultEngine,
        keepBrowserWindowOpen,
        showBrowser,
        showBuiltInBrowser
      })
    )
  })

  app.patch('/v1/settings/web-search', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = updateWebSearchSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const [defaultEngine, keepBrowserWindowOpen, showBrowser, showBuiltInBrowser] =
      await Promise.all([
        parsed.data.defaultEngine
          ? options.webSearchSettingsRepo.setDefaultEngine(parsed.data.defaultEngine)
          : options.webSearchSettingsRepo.getDefaultEngine(),
        parsed.data.keepBrowserWindowOpen === undefined
          ? options.webSearchSettingsRepo.getKeepBrowserWindowOpen()
          : options.webSearchSettingsRepo.setKeepBrowserWindowOpen(
              parsed.data.keepBrowserWindowOpen
            ),
        parsed.data.showBrowser === undefined
          ? options.webSearchSettingsRepo.getShowBrowser()
          : options.webSearchSettingsRepo.setShowBrowser(parsed.data.showBrowser),
        parsed.data.showBuiltInBrowser === undefined
          ? options.webSearchSettingsRepo.getShowBuiltInBrowser()
          : options.webSearchSettingsRepo.setShowBuiltInBrowser(parsed.data.showBuiltInBrowser)
      ])

    if (parsed.data.showBuiltInBrowser !== undefined) {
      await options.onShowBuiltInBrowserChange?.(showBuiltInBrowser)
    }

    return context.json(
      toWebSearchResponse({
        defaultEngine,
        keepBrowserWindowOpen,
        showBrowser,
        showBuiltInBrowser
      })
    )
  })
}

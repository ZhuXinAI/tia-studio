import type { Hono } from 'hono'
import type {
  BrowserAutomationMode,
  WebSearchSettingsRepository
} from '../../persistence/repos/web-search-settings-repo'
import { updateWebSearchSettingsSchema } from '../validators/web-search-validator'

type RegisterWebSearchSettingsRouteOptions = {
  webSearchSettingsRepo: WebSearchSettingsRepository
  onShowBuiltInBrowserChange?: (show: boolean) => Promise<void> | void
  onShowTiaBrowserToolChange?: (show: boolean) => Promise<void> | void
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
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
  showBuiltInBrowser: boolean
  showTiaBrowserTool: boolean
  browserAutomationMode: BrowserAutomationMode
}): {
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
  showBuiltInBrowser: boolean
  showTiaBrowserTool: boolean
  browserAutomationMode: BrowserAutomationMode
} {
  return {
    keepBrowserWindowOpen: input.keepBrowserWindowOpen,
    showBrowser: input.showBrowser,
    showBuiltInBrowser: input.showBuiltInBrowser,
    showTiaBrowserTool: input.showTiaBrowserTool,
    browserAutomationMode: input.browserAutomationMode
  }
}

export function registerWebSearchSettingsRoute(
  app: Hono,
  options: RegisterWebSearchSettingsRouteOptions
): void {
  app.get('/v1/settings/web-search', async (context) => {
    const [
      keepBrowserWindowOpen,
      showBrowser,
      showBuiltInBrowser,
      showTiaBrowserTool,
      browserAutomationMode
    ] = await Promise.all([
      options.webSearchSettingsRepo.getKeepBrowserWindowOpen(),
      options.webSearchSettingsRepo.getShowBrowser(),
      options.webSearchSettingsRepo.getShowBuiltInBrowser(),
      options.webSearchSettingsRepo.getShowTiaBrowserTool(),
      options.webSearchSettingsRepo.getBrowserAutomationMode()
    ])
    return context.json(
      toWebSearchResponse({
        keepBrowserWindowOpen,
        showBrowser,
        showBuiltInBrowser,
        showTiaBrowserTool,
        browserAutomationMode
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

    const [
      keepBrowserWindowOpen,
      showBrowser,
      showBuiltInBrowser,
      showTiaBrowserTool,
      browserAutomationMode
    ] = await Promise.all([
      parsed.data.keepBrowserWindowOpen === undefined
        ? options.webSearchSettingsRepo.getKeepBrowserWindowOpen()
        : options.webSearchSettingsRepo.setKeepBrowserWindowOpen(parsed.data.keepBrowserWindowOpen),
      parsed.data.showBrowser === undefined
        ? options.webSearchSettingsRepo.getShowBrowser()
        : options.webSearchSettingsRepo.setShowBrowser(parsed.data.showBrowser),
      parsed.data.showBuiltInBrowser === undefined
        ? options.webSearchSettingsRepo.getShowBuiltInBrowser()
        : options.webSearchSettingsRepo.setShowBuiltInBrowser(parsed.data.showBuiltInBrowser),
      parsed.data.showTiaBrowserTool === undefined
        ? options.webSearchSettingsRepo.getShowTiaBrowserTool()
        : options.webSearchSettingsRepo.setShowTiaBrowserTool(parsed.data.showTiaBrowserTool),
      parsed.data.browserAutomationMode === undefined
        ? options.webSearchSettingsRepo.getBrowserAutomationMode()
        : options.webSearchSettingsRepo.setBrowserAutomationMode(parsed.data.browserAutomationMode)
    ])

    if (parsed.data.showBuiltInBrowser !== undefined) {
      await options.onShowBuiltInBrowserChange?.(showBuiltInBrowser)
    }

    if (parsed.data.showTiaBrowserTool !== undefined) {
      await options.onShowTiaBrowserToolChange?.(showTiaBrowserTool)
    }

    return context.json(
      toWebSearchResponse({
        keepBrowserWindowOpen,
        showBrowser,
        showBuiltInBrowser,
        showTiaBrowserTool,
        browserAutomationMode
      })
    )
  })
}

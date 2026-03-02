import type { AppDatabase } from '../client'
import {
  defaultWebSearchEngine,
  isWebSearchEngine,
  type WebSearchEngine
} from '../../web-search/web-search-engine'

const defaultEngineKey = 'web_search.default_engine'
const keepBrowserWindowOpenKey = 'web_search.keep_browser_window_open'

function normalizeWebSearchEngine(value: unknown): WebSearchEngine {
  if (isWebSearchEngine(value)) {
    return value
  }

  return defaultWebSearchEngine
}

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true') {
      return true
    }

    if (normalized === '0' || normalized === 'false') {
      return false
    }
  }

  return fallback
}

export class WebSearchSettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async getDefaultEngine(): Promise<WebSearchEngine> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [defaultEngineKey]
    )

    const row = result.rows.at(0) as Record<string, unknown> | undefined
    return normalizeWebSearchEngine(row?.value)
  }

  async setDefaultEngine(engine: WebSearchEngine): Promise<WebSearchEngine> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [defaultEngineKey, engine]
    )

    return engine
  }

  async getKeepBrowserWindowOpen(): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [keepBrowserWindowOpenKey]
    )

    const row = result.rows.at(0) as Record<string, unknown> | undefined
    return normalizeBooleanPreference(row?.value, true)
  }

  async setKeepBrowserWindowOpen(keepOpen: boolean): Promise<boolean> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [keepBrowserWindowOpenKey, keepOpen ? 'true' : 'false']
    )

    return keepOpen
  }
}

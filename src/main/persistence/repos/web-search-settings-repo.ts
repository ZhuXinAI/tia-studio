import type { AppDatabase } from '../client'
const keepBrowserWindowOpenKey = 'web_search.keep_browser_window_open'
const showBrowserKey = 'web_search.show_browser'
const showBuiltInBrowserKey = 'built_in_browser.show_browser'
const showTiaBrowserToolKey = 'tia_browser_tool.show_browser'
const browserAutomationModeKey = 'built_in_browser.automation_mode'

export const browserAutomationModes = ['built-in-browser', 'tia-browser-tool'] as const

export type BrowserAutomationMode = (typeof browserAutomationModes)[number]

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

function normalizeBrowserAutomationMode(value: unknown): BrowserAutomationMode {
  if (typeof value !== 'string') {
    return 'built-in-browser'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'tia-browser-tool' || normalized === 'built-in') {
    return 'tia-browser-tool'
  }

  return 'built-in-browser'
}

export class WebSearchSettingsRepository {
  constructor(private readonly db: AppDatabase) {}

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

  async getShowBrowser(): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [showBrowserKey]
    )

    const row = result.rows.at(0) as Record<string, unknown> | undefined
    return normalizeBooleanPreference(row?.value, false)
  }

  async setShowBrowser(show: boolean): Promise<boolean> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [showBrowserKey, show ? 'true' : 'false']
    )

    return show
  }

  async getShowBuiltInBrowser(): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [showBuiltInBrowserKey]
    )

    const row = result.rows.at(0) as Record<string, unknown> | undefined
    return normalizeBooleanPreference(row?.value, false)
  }

  async setShowBuiltInBrowser(show: boolean): Promise<boolean> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [showBuiltInBrowserKey, show ? 'true' : 'false']
    )

    return show
  }

  async getShowTiaBrowserTool(): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [showTiaBrowserToolKey]
    )

    const row = result.rows.at(0) as Record<string, unknown> | undefined
    return normalizeBooleanPreference(row?.value, false)
  }

  async setShowTiaBrowserTool(show: boolean): Promise<boolean> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [showTiaBrowserToolKey, show ? 'true' : 'false']
    )

    return show
  }

  async getBrowserAutomationMode(): Promise<BrowserAutomationMode> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [browserAutomationModeKey]
    )

    const row = result.rows.at(0) as Record<string, unknown> | undefined
    return normalizeBrowserAutomationMode(row?.value)
  }

  async setBrowserAutomationMode(mode: BrowserAutomationMode): Promise<BrowserAutomationMode> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [browserAutomationModeKey, mode]
    )

    return mode
  }
}

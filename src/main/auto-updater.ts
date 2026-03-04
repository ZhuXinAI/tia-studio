import { join } from 'path'
import { readFile as readFileFromFs, writeFile as writeFileFromFs } from 'node:fs/promises'

export type AutoUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'unsupported'
  | 'error'

export type AutoUpdateState = {
  enabled: boolean
  status: AutoUpdateStatus
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}

type PersistedAutoUpdateSettings = {
  autoUpdateEnabled: boolean
}

type AppLike = {
  isPackaged: boolean
  getPath: (name: 'userData') => string
  getVersion: () => string
}

type UpdaterLike = {
  autoDownload: boolean
  checkForUpdates: () => Promise<{
    updateInfo?: {
      version?: string
    }
  } | null>
}

type AutoUpdateServiceOptions = {
  app: AppLike
  updater: UpdaterLike
  settingsFilePath?: string
  readFile?: (path: string, encoding: 'utf8') => Promise<string>
  writeFile?: (path: string, data: string, encoding: 'utf8') => Promise<void>
}

const defaultState: AutoUpdateState = {
  enabled: true,
  status: 'idle',
  availableVersion: null,
  lastCheckedAt: null,
  message: null
}

function isPersistedAutoUpdateSettings(value: unknown): value is PersistedAutoUpdateSettings {
  if (typeof value !== 'object' || !value) {
    return false
  }

  return typeof (value as PersistedAutoUpdateSettings).autoUpdateEnabled === 'boolean'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected update error.'
}

export class AutoUpdateService {
  private readonly app: AppLike
  private readonly updater: UpdaterLike
  private readonly readFile: (path: string, encoding: 'utf8') => Promise<string>
  private readonly writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
  private readonly settingsFilePath: string
  private state: AutoUpdateState

  constructor(options: AutoUpdateServiceOptions) {
    this.app = options.app
    this.updater = options.updater
    this.readFile = options.readFile ?? readFileFromFs
    this.writeFile = options.writeFile ?? writeFileFromFs
    this.settingsFilePath =
      options.settingsFilePath ?? join(this.app.getPath('userData'), 'auto-update.json')
    this.state = { ...defaultState }
  }

  async init(): Promise<AutoUpdateState> {
    const enabled = await this.loadEnabled()
    this.state.enabled = enabled
    this.updater.autoDownload = enabled
    return this.getState()
  }

  getState(): AutoUpdateState {
    return { ...this.state }
  }

  async setEnabled(enabled: boolean): Promise<AutoUpdateState> {
    this.state.enabled = enabled
    this.updater.autoDownload = enabled
    await this.persistEnabled(enabled)
    return this.getState()
  }

  async checkForUpdates(): Promise<AutoUpdateState> {
    const now = new Date().toISOString()
    this.state.lastCheckedAt = now

    if (!this.app.isPackaged) {
      this.state.status = 'unsupported'
      this.state.availableVersion = null
      this.state.message = 'Auto updates are available in packaged builds only.'
      return this.getState()
    }

    this.state.status = 'checking'
    this.state.message = 'Checking for updates...'

    try {
      const result = await this.updater.checkForUpdates()
      const latestVersion = result?.updateInfo?.version?.trim() ?? null
      const currentVersion = this.app.getVersion().trim()
      const hasUpdate = Boolean(latestVersion && latestVersion !== currentVersion)

      if (hasUpdate) {
        this.state.status = 'update-available'
        this.state.availableVersion = latestVersion
        this.state.message = `Update ${latestVersion} is available.`
      } else {
        this.state.status = 'up-to-date'
        this.state.availableVersion = null
        this.state.message = 'You are up to date.'
      }

      return this.getState()
    } catch (error) {
      this.state.status = 'error'
      this.state.availableVersion = null
      this.state.message = toErrorMessage(error)
      return this.getState()
    }
  }

  private async loadEnabled(): Promise<boolean> {
    try {
      const raw = await this.readFile(this.settingsFilePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (isPersistedAutoUpdateSettings(parsed)) {
        return parsed.autoUpdateEnabled
      }
    } catch {
      return defaultState.enabled
    }

    return defaultState.enabled
  }

  private async persistEnabled(enabled: boolean): Promise<void> {
    const payload = JSON.stringify(
      {
        autoUpdateEnabled: enabled
      },
      null,
      2
    )

    await this.writeFile(this.settingsFilePath, payload, 'utf8')
  }
}

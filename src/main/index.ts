import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  type OpenDialogOptions,
  nativeImage
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { serve, type ServerType } from '@hono/node-server'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { AutoUpdateService } from './auto-updater'
import { resolveServerConfig } from './config/server-config'
import { getCodexCliStatus } from './codex/codex-cli'
import { ensureBuiltInDefaultAgent } from './default-agent/default-agent-bootstrap'
import { ensureBuiltInProviders } from './default-agent/built-in-providers-bootstrap'
import { ensureBuiltInDefaultTeamWorkspace } from './default-team/default-team-bootstrap'
import { logger } from './utils/logger'
import { ChannelEventBus } from './channels/channel-event-bus'
import { resolveGroupRequireMention } from './channels/channel-config'
import { createLlmInterruptionDecider } from './channels/llm-interruption-decider'
import { ChannelMessageRouter } from './channels/channel-message-router'
import { ChannelService } from './channels/channel-service'
import { TelegramChannel } from './channels/telegram-channel'
import { WechatKfChannel } from './channels/wechat-kf-channel'
import { WeComChannel } from './channels/wecom-channel'
import { WhatsAppAuthStateStore } from './channels/whatsapp-auth-state-store'
import { WhatsAppChannel } from './channels/whatsapp-channel'
import { AssistantCronJobsService } from './cron/assistant-cron-jobs-service'
import { NodeCronSchedulerService } from './cron/node-cron-scheduler-service'
import { AssistantHeartbeatsService } from './heartbeat/assistant-heartbeats-service'
import { HeartbeatSchedulerService } from './heartbeat/heartbeat-scheduler-service'
import { BuiltInBrowserManager } from './built-in-browser-manager'
import { AssistantRuntimeService } from './mastra/assistant-runtime'
import { createMastraInstance } from './mastra/store'
import { TeamRuntimeService } from './mastra/team-runtime'
import { migrateAppSchema } from './persistence/migrate'
import { AssistantHeartbeatRunsRepository } from './persistence/repos/assistant-heartbeat-runs-repo'
import { AssistantHeartbeatsRepository } from './persistence/repos/assistant-heartbeats-repo'
import { AssistantsRepository } from './persistence/repos/assistants-repo'
import { ChannelPairingsRepository } from './persistence/repos/channel-pairings-repo'
import { ChannelThreadBindingsRepository } from './persistence/repos/channel-thread-bindings-repo'
import { ChannelsRepository } from './persistence/repos/channels-repo'
import { CronJobRunsRepository } from './persistence/repos/cron-job-runs-repo'
import { CronJobsRepository } from './persistence/repos/cron-jobs-repo'
import {
  type ManagedRuntimeKind,
  ManagedRuntimesRepository
} from './persistence/repos/managed-runtimes-repo'
import { McpServersRepository } from './persistence/repos/mcp-servers-repo'
import { ProvidersRepository } from './persistence/repos/providers-repo'
import { SecuritySettingsRepository } from './persistence/repos/security-settings-repo'
import { TeamThreadsRepository } from './persistence/repos/team-threads-repo'
import { TeamWorkspacesRepository } from './persistence/repos/team-workspaces-repo'
import { ThreadUsageRepository } from './persistence/repos/thread-usage-repo'
import { ThreadsRepository } from './persistence/repos/threads-repo'
import { runThreadUsageBackfill } from './persistence/thread-usage-backfill'
import { WebSearchSettingsRepository } from './persistence/repos/web-search-settings-repo'
import { ManagedRuntimeService } from './runtimes/managed-runtime-service'
import { TeamRunStatusStore } from './server/chat/team-run-status-store'
import { ThreadMessageEventsStore } from './server/chat/thread-message-events-store'
import { createApp } from './server/create-app'
import { registerSingleInstanceApp } from './single-instance'
import {
  getInstalledRecommendedSkills,
  installRecommendedSkillsWithBunx,
  listAssistantSkills,
  removeWorkspaceSkill,
  type RecommendedSkillId
} from './skills/skills-manager'
import { bringWindowToFront, buildTrayMenuTemplate } from './tray'
import { UiConfigStore } from './ui-config'

const hasSingleInstanceLock = registerSingleInstanceApp({
  app,
  onSecondInstance: () => {
    openMainWindow()
  }
})

const serverConfig = resolveServerConfig({})
const autoUpdateService = new AutoUpdateService({
  app,
  updater: autoUpdater,
  onStateChange: (state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('tia:auto-update-state-changed', state)
      }
    }
  }
})
let localApiServer: ServerType | null = null
let persistenceDatabasePath: string | null = null
let appTray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let webSearchSettingsWindow: BrowserWindow | null = null
let managedRuntimeService: ManagedRuntimeService | null = null
let channelService: ChannelService | null = null
let channelMessageRouter: ChannelMessageRouter | null = null
let cronSchedulerService: NodeCronSchedulerService | null = null
let heartbeatSchedulerService: HeartbeatSchedulerService | null = null
let builtInBrowserManager: BuiltInBrowserManager | null = null
const webFetchBrowserPartition = 'persist:tia-web-fetch'
let uiConfigStore: UiConfigStore | null = null

function resolveUiConfigStore(): UiConfigStore {
  if (!uiConfigStore) {
    uiConfigStore = new UiConfigStore({
      filePath: join(app.getPath('userData'), 'ui-config.json')
    })
  }

  return uiConfigStore
}

let isTransparentWindow = Boolean(resolveUiConfigStore().getConfig().transparent)

function normalizeWebSearchSettingsUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid web search settings URL')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Web search settings URL must use HTTP or HTTPS')
  }

  return parsed.toString()
}

function assertManagedRuntimeKind(value: unknown): ManagedRuntimeKind {
  if (value === 'bun' || value === 'uv') {
    return value
  }

  throw new Error('Managed runtime kind must be "bun" or "uv"')
}

function assertRecommendedSkillIds(value: unknown): RecommendedSkillId[] {
  if (!Array.isArray(value)) {
    throw new Error('Recommended skill ids must be an array')
  }

  return value.map((entry) => {
    if (entry === 'agent-browser' || entry === 'find-skills') {
      return entry
    }

    throw new Error('Recommended skill id is invalid')
  })
}

function resolveManagedRuntimeService(): ManagedRuntimeService {
  if (!managedRuntimeService) {
    throw new Error('Managed runtime service is not ready')
  }

  return managedRuntimeService
}

function resolveBuiltInBrowserManager(): BuiltInBrowserManager {
  if (!builtInBrowserManager) {
    builtInBrowserManager = new BuiltInBrowserManager({
      executablePath: process.execPath,
      entryPath: join(__dirname, 'built-in-browser.js'),
      profileRootPath: join(app.getPath('userData'), 'built-in-browser-profiles')
    })
  }

  return builtInBrowserManager
}

async function syncBuiltInBrowserVisibility(visible: boolean): Promise<void> {
  const manager = resolveBuiltInBrowserManager()
  if (visible) {
    await manager.showWindow()
    return
  }

  await manager.hideWindow()
}

function resolveWebSearchSettingsWindow(parentWindow: BrowserWindow | null): BrowserWindow {
  if (webSearchSettingsWindow && !webSearchSettingsWindow.isDestroyed()) {
    return webSearchSettingsWindow
  }

  const browserWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    parent: parentWindow ?? undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: webFetchBrowserPartition
    }
  })

  browserWindow.once('ready-to-show', () => {
    browserWindow.show()
  })
  browserWindow.on('closed', () => {
    if (webSearchSettingsWindow === browserWindow) {
      webSearchSettingsWindow = null
    }
  })
  browserWindow.webContents.setWindowOpenHandler((details) => {
    void browserWindow.loadURL(details.url)
    return { action: 'deny' }
  })

  webSearchSettingsWindow = browserWindow
  return browserWindow
}

async function startLocalApiServer(): Promise<void> {
  if (localApiServer) {
    return
  }

  logger.setFileOutput(join(app.getPath('userData'), 'logs', 'tia-studio.log'))
  persistenceDatabasePath = join(app.getPath('userData'), 'tia-studio.db')
  const db = await migrateAppSchema(persistenceDatabasePath)
  const providersRepo = new ProvidersRepository(db)
  const assistantsRepo = new AssistantsRepository(db)
  const threadsRepo = new ThreadsRepository(db)
  const channelsRepo = new ChannelsRepository(db)
  const channelPairingsRepo = new ChannelPairingsRepository(db)
  const cronJobRunsRepo = new CronJobRunsRepository(db)
  const cronJobsRepo = new CronJobsRepository(db)
  const heartbeatsRepo = new AssistantHeartbeatsRepository(db)
  const heartbeatRunsRepo = new AssistantHeartbeatRunsRepository(db)
  const channelThreadBindingsRepo = new ChannelThreadBindingsRepository(db)
  const teamWorkspacesRepo = new TeamWorkspacesRepository(db)
  const teamThreadsRepo = new TeamThreadsRepository(db)
  const webSearchSettingsRepo = new WebSearchSettingsRepository(db)
  const securitySettingsRepo = new SecuritySettingsRepository(db)
  const threadUsageRepo = new ThreadUsageRepository(db)
  const mcpServersRepo = new McpServersRepository(join(app.getPath('userData'), 'mcp.json'))
  const managedRuntimesRepo = new ManagedRuntimesRepository(
    join(app.getPath('userData'), 'managed-runtimes.json')
  )
  managedRuntimeService = new ManagedRuntimeService({
    repository: managedRuntimesRepo,
    managedRootPath: join(app.getPath('userData'), 'managed-runtimes')
  })
  await ensureBuiltInProviders(providersRepo)
  await ensureBuiltInDefaultAgent({
    assistantsRepo,
    providersRepo,
    userDataPath: app.getPath('userData')
  })
  await ensureBuiltInDefaultTeamWorkspace({
    teamWorkspacesRepo,
    providersRepo,
    userDataPath: app.getPath('userData')
  })
  const channelEventBus = new ChannelEventBus()
  const whatsAppAuthStateStore = new WhatsAppAuthStateStore()
  const assistantCronJobsService = new AssistantCronJobsService({
    cronJobsRepo,
    assistantsRepo,
    threadsRepo,
    channelThreadBindingsRepo,
    reloadScheduler: async () => cronSchedulerService?.reload()
  })
  const assistantHeartbeatsService = new AssistantHeartbeatsService({
    heartbeatsRepo,
    assistantsRepo,
    threadsRepo,
    reloadScheduler: async () => heartbeatSchedulerService?.reload()
  })
  const mastraDbPath = join(app.getPath('userData'), 'mastra.db')
  const mastra = await createMastraInstance(mastraDbPath)
  await runThreadUsageBackfill({
    appDb: db,
    mastraDbPath,
    usageRepo: threadUsageRepo
  })
  const threadMessageEventsStore = new ThreadMessageEventsStore()
  const assistantRuntime = new AssistantRuntimeService({
    mastra,
    assistantsRepo,
    providersRepo,
    threadsRepo,
    channelThreadBindingsRepo,
    webSearchSettingsRepo,
    securitySettingsRepo,
    mcpServersRepo,
    channelsRepo,
    channelEventBus,
    threadMessageEventsStore,
    threadUsageRepo,
    cronJobService: assistantCronJobsService,
    managedRuntimeResolver: managedRuntimeService,
    builtInBrowserManager: resolveBuiltInBrowserManager()
  })
  const teamRunStatusStore = new TeamRunStatusStore()
  const teamRuntime = new TeamRuntimeService({
    mastra,
    assistantsRepo,
    providersRepo,
    teamWorkspacesRepo,
    teamThreadsRepo,
    statusStore: teamRunStatusStore,
    builtInBrowserManager: resolveBuiltInBrowserManager()
  })
  channelService = new ChannelService({
    channelsRepo,
    eventBus: channelEventBus,
    adapterFactories: {
      telegram: async (channel) => {
        const botToken = channel.config.botToken
        if (typeof botToken !== 'string' || botToken.trim().length === 0) {
          throw new Error(`Channel ${channel.id} is missing required config: botToken`)
        }

        return new TelegramChannel({
          id: channel.id,
          botToken,
          pairingsRepo: channelPairingsRepo,
          groupRequireMention: resolveGroupRequireMention(channel.config),
          onFatalError: async (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            await channelsRepo.setLastError(channel.id, message)
          }
        })
      },
      wecom: async (channel) => {
        const botId = channel.config.botId
        if (typeof botId !== 'string' || botId.trim().length === 0) {
          throw new Error(`Channel ${channel.id} is missing required config: botId`)
        }

        const secret = channel.config.secret
        if (typeof secret !== 'string' || secret.trim().length === 0) {
          throw new Error(`Channel ${channel.id} is missing required config: secret`)
        }

        return new WeComChannel({
          id: channel.id,
          botId,
          secret,
          groupRequireMention: resolveGroupRequireMention(channel.config),
          onFatalError: async (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            await channelsRepo.setLastError(channel.id, message)
          }
        })
      },
      'wechat-kf': async (channel) => {
        const serverUrl = channel.config.serverUrl
        if (typeof serverUrl !== 'string' || serverUrl.trim().length === 0) {
          throw new Error(`Channel ${channel.id} is missing required config: serverUrl`)
        }

        const serverKey = channel.config.serverKey
        if (typeof serverKey !== 'string' || serverKey.trim().length === 0) {
          throw new Error(`Channel ${channel.id} is missing required config: serverKey`)
        }

        return new WechatKfChannel({
          id: channel.id,
          serverUrl,
          serverKey,
          onFatalError: async (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            await channelsRepo.setLastError(channel.id, message)
          }
        })
      },
      whatsapp: async (channel) => {
        return new WhatsAppChannel({
          id: channel.id,
          authDirectoryPath: join(app.getPath('userData'), 'channels', 'whatsapp', channel.id),
          pairingsRepo: channelPairingsRepo,
          authStateStore: whatsAppAuthStateStore,
          groupRequireMention: resolveGroupRequireMention(channel.config),
          onFatalError: async (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            await channelsRepo.setLastError(channel.id, message)
          }
        })
      }
    }
  })
  channelMessageRouter = new ChannelMessageRouter({
    eventBus: channelEventBus,
    channelsRepo,
    bindingsRepo: channelThreadBindingsRepo,
    threadsRepo,
    assistantRuntime,
    interruptionDecider: createLlmInterruptionDecider({
      assistantsRepo,
      providersRepo
    }),
    resolveToolProgressLocale: () => resolveUiConfigStore().getConfig().language ?? app.getLocale(),
    threadMessageEventsStore
  })
  cronSchedulerService = new NodeCronSchedulerService({
    cronJobsRepo,
    cronJobRunsRepo,
    assistantsRepo,
    runJob: async (job) => {
      let threadId = job.threadId

      // If cron job has channel context, look up the thread from the channel binding
      if (job.channelId && job.remoteChatId) {
        const binding = await channelThreadBindingsRepo.getByChannelAndRemoteChat(
          job.channelId,
          job.remoteChatId
        )
        if (binding) {
          threadId = binding.threadId
        } else {
          throw new Error(
            `Channel binding not found for channelId=${job.channelId}, remoteChatId=${job.remoteChatId}`
          )
        }
      }

      if (!threadId) {
        throw new Error('Cron job thread is missing')
      }

      return assistantRuntime.runCronJob({
        assistantId: job.assistantId,
        threadId,
        prompt: job.prompt,
        channelId: job.channelId ?? undefined,
        remoteChatId: job.remoteChatId ?? undefined
      })
    }
  })
  heartbeatSchedulerService = new HeartbeatSchedulerService({
    heartbeatsRepo,
    heartbeatRunsRepo,
    assistantsRepo,
    debugMode: process.env.HEARTBEAT_DEBUG === 'true',
    ensureHeartbeatThread: (assistantId, heartbeatId) =>
      assistantHeartbeatsService.ensureHeartbeatThread(assistantId, heartbeatId),
    runHeartbeat: async (heartbeat) => {
      if (!heartbeat.threadId) {
        throw new Error('Heartbeat thread is missing')
      }

      return assistantRuntime.runHeartbeat({
        assistantId: heartbeat.assistantId,
        threadId: heartbeat.threadId,
        prompt: heartbeat.prompt,
        intervalMinutes: heartbeat.intervalMinutes
      })
    }
  })

  const apiApp = createApp({
    token: serverConfig.token,
    repositories: {
      providers: providersRepo,
      assistants: assistantsRepo,
      threads: threadsRepo,
      channels: channelsRepo,
      pairings: channelPairingsRepo,
      channelThreadBindings: channelThreadBindingsRepo,
      cronJobs: cronJobsRepo,
      cronJobRuns: cronJobRunsRepo,
      heartbeats: heartbeatsRepo,
      heartbeatRuns: heartbeatRunsRepo,
      teamWorkspaces: teamWorkspacesRepo,
      teamThreads: teamThreadsRepo,
      webSearchSettings: webSearchSettingsRepo,
      securitySettings: securitySettingsRepo,
      mcpServers: mcpServersRepo,
      threadUsage: threadUsageRepo
    },
    assistantRuntime,
    teamRuntime,
    teamRunStatusStore,
    threadMessageEventsStore,
    channelService,
    cronSchedulerService,
    heartbeatSchedulerService,
    whatsAppAuthStateStore,
    onShowBuiltInBrowserChange: async (show) => {
      await syncBuiltInBrowserVisibility(show)
    },
    onShowBuiltInBrowserWindow: async () => {
      await resolveBuiltInBrowserManager().showWindow()
    }
  })

  const initialBuiltInBrowserVisible = await webSearchSettingsRepo.getShowBuiltInBrowser()
  void syncBuiltInBrowserVisibility(initialBuiltInBrowserVisible).catch((error) => {
    logger.error('[BuiltInBrowser] failed to apply initial visibility preference:', error)
  })

  localApiServer = serve(
    {
      fetch: apiApp.fetch,
      hostname: serverConfig.host,
      port: serverConfig.port
    },
    (serverInfo) => {
      logger.info(
        `Tia local API is running on http://${serverInfo.address}:${serverInfo.port} (localhost only)`
      )
      if (persistenceDatabasePath) {
        logger.info(`Tia database path: ${persistenceDatabasePath}`)
      }
    }
  )

  await channelMessageRouter.start()
  await channelService.start()
  await cronSchedulerService.start()
  await heartbeatSchedulerService.start()
}

function stopLocalApiServer(): void {
  if (channelService) {
    void channelService.stop()
    channelService = null
  }

  if (channelMessageRouter) {
    void channelMessageRouter.stop()
    channelMessageRouter = null
  }

  if (cronSchedulerService) {
    void cronSchedulerService.stop()
    cronSchedulerService = null
  }

  if (heartbeatSchedulerService) {
    void heartbeatSchedulerService.stop()
    heartbeatSchedulerService = null
  }

  if (!localApiServer) {
    return
  }

  localApiServer.close()
  localApiServer = null
  logger.close()
}

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  // Create the browser window.
  const browserWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(isMac
      ? {
          titleBarStyle: 'hidden' as const,
          ...(isTransparentWindow
            ? {
                vibrancy: 'sidebar',
                transparent: true,
                visualEffectState: 'active',
                backgroundColor: '#00000000'
              }
            : { backgroundColor: '#ffffff' })
        }
      : { backgroundColor: '#ffffff' }),
    ...(process.platform === 'linux' ? { icon, backgroundColor: '#ffffff' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  browserWindow.on('ready-to-show', () => {
    browserWindow.show()
  })
  browserWindow.on('closed', () => {
    if (mainWindow === browserWindow) {
      mainWindow = null
    }
  })

  if (is.dev) {
    browserWindow.webContents.once('did-finish-load', () => {
      browserWindow.webContents.openDevTools({ mode: 'detach' })
    })
  }

  browserWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    browserWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    browserWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return browserWindow
}

function resolveMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  mainWindow = createMainWindow()
  return mainWindow
}

function openMainWindow(): void {
  const hasExistingWindow = Boolean(mainWindow && !mainWindow.isDestroyed())
  const browserWindow = resolveMainWindow()
  if (!hasExistingWindow) {
    return
  }

  bringWindowToFront(browserWindow)
}

function createTray(): void {
  if (appTray) {
    return
  }

  const contextMenu = Menu.buildFromTemplate(
    buildTrayMenuTemplate({
      onOpenWindow: () => {
        openMainWindow()
      },
      onQuit: () => {
        app.quit()
      }
    })
  )

  const image = nativeImage.createFromPath(icon)
  const tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('TIA Studio')
  tray.on('click', () => {
    openMainWindow()
  })
  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu)
  })

  appTray = tray
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')
    await autoUpdateService.init()

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => logger.debug('pong'))
    ipcMain.handle('tia:get-desktop-config', () => {
      return {
        baseUrl: `http://${serverConfig.host}:${serverConfig.port}`,
        authToken: serverConfig.token
      }
    })
    ipcMain.handle('tia:get-ui-config', () => {
      return resolveUiConfigStore().getConfig()
    })
    ipcMain.handle('tia:set-ui-config', (_event, config) => {
      const nextConfig = resolveUiConfigStore().updateConfig(config)
      isTransparentWindow = Boolean(nextConfig.transparent)
      return nextConfig
    })
    ipcMain.handle('tia:get-system-locale', () => {
      return app.getLocale()
    })
    ipcMain.handle('tia:get-app-info', () => {
      return {
        name: app.getName(),
        version: app.getVersion()
      }
    })
    ipcMain.handle('tia:get-auto-update-state', () => {
      return autoUpdateService.getState()
    })
    ipcMain.handle('tia:set-auto-update-enabled', async (_event, enabled) => {
      if (typeof enabled !== 'boolean') {
        throw new Error('Auto update flag must be a boolean')
      }

      return autoUpdateService.setEnabled(enabled)
    })
    ipcMain.handle('tia:check-for-updates', () => {
      return autoUpdateService.checkForUpdates()
    })
    ipcMain.handle('tia:get-codex-cli-status', () => {
      return getCodexCliStatus()
    })
    ipcMain.handle('tia:restart-to-update', () => {
      autoUpdateService.restartToUpdate()
    })
    ipcMain.handle('tia:get-managed-runtime-status', () => {
      return resolveManagedRuntimeService().getStatus()
    })
    ipcMain.handle('tia:check-managed-runtime-latest', async (_event, rawKind) => {
      const kind = assertManagedRuntimeKind(rawKind)
      return resolveManagedRuntimeService().checkLatest(kind)
    })
    ipcMain.handle('tia:install-managed-runtime', async (_event, rawKind) => {
      const kind = assertManagedRuntimeKind(rawKind)
      return resolveManagedRuntimeService().installManagedRuntime(kind)
    })
    ipcMain.handle('tia:pick-custom-runtime', async (event, rawKind) => {
      const kind = assertManagedRuntimeKind(rawKind)
      const currentWindow = BrowserWindow.fromWebContents(event.sender)
      const openDialogOptions: OpenDialogOptions = {
        title: `Select ${kind === 'bun' ? 'Bun' : 'UV'} Binary`,
        properties: ['openFile']
      }
      const result = currentWindow
        ? await dialog.showOpenDialog(currentWindow, openDialogOptions)
        : await dialog.showOpenDialog(openDialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return resolveManagedRuntimeService().setCustomRuntime(kind, result.filePaths[0])
    })
    ipcMain.handle('tia:clear-managed-runtime', async (_event, rawKind) => {
      const kind = assertManagedRuntimeKind(rawKind)
      return resolveManagedRuntimeService().clearRuntime(kind)
    })
    ipcMain.handle('tia:get-runtime-onboarding-skills-status', async () => {
      return getInstalledRecommendedSkills()
    })
    ipcMain.handle('tia:install-runtime-onboarding-skills', async (_event, rawSkillIds) => {
      const skillIds = assertRecommendedSkillIds(rawSkillIds)
      const managedRuntimeState = await resolveManagedRuntimeService().getStatus()
      const bunRecord = managedRuntimeState.bun
      const isBunReady =
        typeof bunRecord.binaryPath === 'string' &&
        (bunRecord.status === 'ready' ||
          bunRecord.status === 'custom-ready' ||
          bunRecord.status === 'update-available')

      if (!isBunReady) {
        throw new Error('Install bun in Runtime Setup before installing recommended skills')
      }

      const bunxCommand = await resolveManagedRuntimeService().resolveManagedCommand('bunx', [])
      return installRecommendedSkillsWithBunx({
        bunxPath: bunxCommand.command,
        bunxArgs: bunxCommand.args,
        env: bunxCommand.env,
        skillIds
      })
    })
    ipcMain.handle('tia:pick-directory', async (event) => {
      const currentWindow = BrowserWindow.fromWebContents(event.sender)
      const openDialogOptions: OpenDialogOptions = {
        title: 'Select Workspace Folder',
        properties: ['openDirectory', 'createDirectory']
      }
      const result = currentWindow
        ? await dialog.showOpenDialog(currentWindow, openDialogOptions)
        : await dialog.showOpenDialog(openDialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    })
    ipcMain.handle('tia:list-assistant-skills', async (_event, workspaceRootPath) => {
      if (typeof workspaceRootPath !== 'string') {
        throw new Error('Workspace root path must be a string')
      }

      return listAssistantSkills(workspaceRootPath)
    })
    ipcMain.handle(
      'tia:remove-assistant-workspace-skill',
      async (_event, workspaceRootPath, relativePath) => {
        if (typeof workspaceRootPath !== 'string') {
          throw new Error('Workspace root path must be a string')
        }
        if (typeof relativePath !== 'string') {
          throw new Error('Relative skill path must be a string')
        }

        await removeWorkspaceSkill(workspaceRootPath, relativePath)
      }
    )
    ipcMain.handle('tia:open-web-search-settings', async (event, rawUrl) => {
      if (typeof rawUrl !== 'string') {
        throw new Error('Web search settings URL must be a string')
      }

      const url = normalizeWebSearchSettingsUrl(rawUrl)
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      const browserWindow = resolveWebSearchSettingsWindow(parentWindow)
      await browserWindow.loadURL(url)

      if (!browserWindow.isVisible()) {
        browserWindow.show()
      }
      browserWindow.focus()

      return true
    })

    await startLocalApiServer()
    openMainWindow()
    createTray()
    if (autoUpdateService.getState().enabled && app.isPackaged) {
      void autoUpdateService.checkForUpdates().catch((error) => {
        logger.error('Initial auto update check failed:', error)
      })
    }

    app.on('activate', function () {
      openMainWindow()
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('before-quit', () => {
  if (appTray) {
    appTray.destroy()
    appTray = null
  }
  builtInBrowserManager?.shutdown()
  stopLocalApiServer()
})

app.on('window-all-closed', () => {
  // Keep the process alive so the tray menu can reopen the window.
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

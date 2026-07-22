import {
  app,
  shell,
  BrowserWindow,
  dialog,
  Menu,
  Tray,
  autoUpdater as electronAutoUpdater,
  type OpenDialogOptions,
  nativeImage
} from 'electron'
import { rm } from 'node:fs/promises'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { serve, type ServerType } from '@hono/node-server'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { AutoUpdateService } from './auto-updater'
import { resolveAvailableServerPort, resolveServerConfig } from './config/server-config'
import { ensureBuiltInProviders } from './providers/built-in-providers-bootstrap'
import { logger } from './utils/logger'
import { ChannelEventBus } from './channels/channel-event-bus'
import { resolveGroupRequireMention } from './channels/channel-config'
import { DiscordChannel } from './channels/discord-channel'
import { ChannelMessageRouter } from './channels/channel-message-router'
import { ChannelService } from './channels/channel-service'
import { TelegramChannel } from './channels/telegram-channel'
import { WechatAuthStateStore } from './channels/wechat-auth-state-store'
import { WechatChannel } from './channels/wechat-channel'
import { WeComChannel } from './channels/wecom-channel'
import { WhatsAppAuthStateStore } from './channels/whatsapp-auth-state-store'
import { WhatsAppChannel } from './channels/whatsapp-channel'
import { migrateAppSchema } from './persistence/migrate'
import { ChannelPairingsRepository } from './persistence/repos/channel-pairings-repo'
import { ChannelSessionBindingsRepository } from './persistence/repos/channel-session-bindings-repo'
import { ChannelsRepository } from './persistence/repos/channels-repo'
import {
  type ManagedRuntimeKind,
  ManagedRuntimesRepository
} from './persistence/repos/managed-runtimes-repo'
import { McpServersRepository } from './persistence/repos/mcp-servers-repo'
import { ProvidersRepository } from './persistence/repos/providers-repo'
import { PermissionRulesRepository } from './persistence/repos/permission-rules-repo'
import { WebSearchSettingsRepository } from './persistence/repos/web-search-settings-repo'
import { WorkspaceRecordsRepository } from './persistence/repos/workspace-records-repo'
import {
  resolveBuiltInChatsWorkspacePath,
  WorkspacesRepository
} from './persistence/repos/workspaces-repo'
import { ManagedRuntimeService } from './runtimes/managed-runtime-service'
import { createApp } from './server/create-app'
import { registerSingleInstanceApp } from './single-instance'
import {
  getInstalledRecommendedSkills,
  installRecommendedSkillsWithBunx,
  installMarketplaceSkill,
  listDiscoveredSkills,
  listDiscoveredSkillsPage,
  listSkillMarketplace,
  type RecommendedSkillId
} from './skills/skills-manager'
import { bringWindowToFront, buildTrayMenuTemplate } from './tray'
import { UiConfigStore } from './ui-config'
import { desktopBootstrapQueryParam, type DesktopBootstrap } from '../shared/desktop-bootstrap'
import { AgentSessionsRepository } from './persistence/repos/agent-sessions-repo'
import { AgentRuntimeManager } from './agents/agent-runtime-manager'
import { McpServerHealthRegistry } from './agents/pi/mcp-server-health'
import { AutomationsRepository } from './persistence/repos/automations-repo'
import { AutomationService } from './automations/automation-service'
import { listWorkspaceFiles } from './workspaces/workspace-file-search'

const hasSingleInstanceLock = registerSingleInstanceApp({
  app,
  onSecondInstance: () => {
    openMainWindow()
  }
})

let serverConfig = resolveServerConfig({})
const annotationAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const isBrowserAnnotationModeEnabled =
  is.dev && !app.isPackaged && process.env['TIA_ENABLE_BROWSER_ANNOTATION'] === '1'
const autoUpdateService = new AutoUpdateService({
  app,
  updater: autoUpdater,
  logger
})
let localApiServer: ServerType | null = null
let persistenceDatabasePath: string | null = null
let appTray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let managedRuntimeService: ManagedRuntimeService | null = null
let channelService: ChannelService | null = null
let channelMessageRouter: ChannelMessageRouter | null = null
let uiConfigStore: UiConfigStore | null = null
let agentRuntimeManager: AgentRuntimeManager | null = null
let automationService: AutomationService | null = null
let gracefulQuitStarted = false

function logAppLifecycle(eventName: string, data?: Record<string, unknown>): void {
  logger.info(`[AppLifecycle] ${eventName}`, {
    windowCount: BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed()).length,
    ...data
  })
}

function resolveUiConfigStore(): UiConfigStore {
  if (!uiConfigStore) {
    uiConfigStore = new UiConfigStore({
      filePath: join(app.getPath('userData'), 'ui-config.json')
    })
  }

  return uiConfigStore
}

function resolveDesktopBootstrap(): DesktopBootstrap {
  const authMode = isBrowserAnnotationModeEnabled ? 'none' : 'bearer'
  const platform =
    process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux'

  return {
    apiBaseUrl: `http://${serverConfig.host}:${serverConfig.port}`,
    authMode,
    authToken: authMode === 'bearer' ? serverConfig.token : undefined,
    app: {
      name: 'TIA Studio',
      version: app.getVersion(),
      platform
    },
    capabilities: {
      autoUpdate: true,
      managedRuntimes: true,
      nativeDirectoryPicker: true,
      runtimeOnboarding: true
    }
  }
}

function encodeDesktopBootstrapQueryValue(bootstrap: DesktopBootstrap): string {
  return Buffer.from(JSON.stringify(bootstrap), 'utf8').toString('base64url')
}

function attachDesktopBootstrapToRendererUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.searchParams.set(
    desktopBootstrapQueryParam,
    encodeDesktopBootstrapQueryValue(resolveDesktopBootstrap())
  )
  return url.toString()
}

function resolveDialogParentWindow(): BrowserWindow | undefined {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    return focusedWindow
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
}

function getRuntimeDisplayName(kind: ManagedRuntimeKind): string {
  if (kind === 'bun') {
    return 'Bun'
  }

  if (kind === 'uv') {
    return 'UV'
  }

  if (kind === 'agent-browser') {
    return 'Agent Browser'
  }

  return kind
}

function updateUiConfig(config: Parameters<UiConfigStore['updateConfig']>[0]) {
  return resolveUiConfigStore().updateConfig(config)
}

async function pickCustomManagedRuntime(
  kind: ManagedRuntimeKind
): Promise<Awaited<ReturnType<ManagedRuntimeService['getStatus']>> | null> {
  const currentWindow = resolveDialogParentWindow()
  const openDialogOptions: OpenDialogOptions = {
    title: `Select ${getRuntimeDisplayName(kind)} Binary`,
    properties: ['openFile']
  }
  const result = currentWindow
    ? await dialog.showOpenDialog(currentWindow, openDialogOptions)
    : await dialog.showOpenDialog(openDialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const state = await resolveManagedRuntimeService().setCustomRuntime(kind, result.filePaths[0])
  await syncManagedRuntimeProcessEnv()
  return state
}

async function installRuntimeOnboardingSkillsWithManagedBun(
  skillIds: RecommendedSkillId[]
): Promise<RecommendedSkillId[]> {
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
}

async function pickDirectory(): Promise<string | null> {
  const currentWindow = resolveDialogParentWindow()
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
}

function resolveManagedRuntimeService(): ManagedRuntimeService {
  if (!managedRuntimeService) {
    throw new Error('Managed runtime service is not ready')
  }

  return managedRuntimeService
}

async function syncManagedRuntimeProcessEnv(): Promise<void> {
  const nextEnv = await resolveManagedRuntimeService().getAugmentedEnv(process.env)
  for (const [key, value] of Object.entries(nextEnv)) {
    if (typeof value === 'string') {
      process.env[key] = value
      continue
    }

    if (value === undefined) {
      delete process.env[key]
    }
  }
}

async function startLocalApiServer(): Promise<void> {
  if (localApiServer) {
    return
  }

  logger.setFileOutput(join(app.getPath('userData'), 'logs', 'tia-studio.log'))
  const resolvedPort = await resolveAvailableServerPort({
    host: serverConfig.host,
    preferredPort: serverConfig.port
  })
  if (resolvedPort !== serverConfig.port) {
    if (isBrowserAnnotationModeEnabled) {
      throw new Error(
        `Browser annotation mode requires http://${serverConfig.host}:${serverConfig.port}; stop the process using that port and retry.`
      )
    }

    logger.warn(
      `TIA local API default port ${serverConfig.port} was already in use, falling back to ${resolvedPort}`
    )
    serverConfig = {
      ...serverConfig,
      port: resolvedPort
    }
  }
  persistenceDatabasePath = join(app.getPath('userData'), 'tia-studio.db')
  const db = await migrateAppSchema(persistenceDatabasePath)
  const providersRepo = new ProvidersRepository(db)
  const permissionRulesRepo = new PermissionRulesRepository(db)
  const agentSessionsRepo = new AgentSessionsRepository(db)
  const automationsRepo = new AutomationsRepository(db)
  const workspaceRecordsRepo = new WorkspaceRecordsRepository(db)
  const workspacesRepo = new WorkspacesRepository({
    workspaceRecordsRepo,
    builtInChatsRootPath: resolveBuiltInChatsWorkspacePath(app.getPath('userData'))
  })
  const channelsRepo = new ChannelsRepository(db)
  const channelPairingsRepo = new ChannelPairingsRepository(db)
  const channelSessionBindingsRepo = new ChannelSessionBindingsRepository(db)
  const webSearchSettingsRepo = new WebSearchSettingsRepository(db)
  const mcpServersRepo = new McpServersRepository(join(app.getPath('userData'), 'mcp.json'))
  const mcpServerHealth = new McpServerHealthRegistry()
  const managedRuntimesRepo = new ManagedRuntimesRepository(
    join(app.getPath('userData'), 'managed-runtimes.json')
  )
  managedRuntimeService = new ManagedRuntimeService({
    repository: managedRuntimesRepo,
    managedRootPath: join(app.getPath('userData'), 'managed-runtimes')
  })
  await syncManagedRuntimeProcessEnv()
  await ensureBuiltInProviders(providersRepo)
  await workspacesRepo.ensureBuiltInChatsWorkspace()
  const channelEventBus = new ChannelEventBus()
  const whatsAppAuthStateStore = new WhatsAppAuthStateStore()
  const wechatAuthStateStore = new WechatAuthStateStore()
  agentRuntimeManager = new AgentRuntimeManager({
    sessionsRepo: agentSessionsRepo,
    providersRepo,
    permissionRulesRepo,
    agentDataRoot: join(app.getPath('userData'), 'pi-agent'),
    sessionDataRoot: join(app.getPath('userData'), 'pi-sessions'),
    credentialRoot: app.getPath('userData'),
    globalSkillsRoot: join(app.getPath('userData'), 'skills'),
    mcpServersRepo,
    mcpServerHealth,
    resolveMcpCommand: (command, args, env) =>
      resolveManagedRuntimeService().resolveManagedCommand(command, args, env),
    stateManagement: {
      providers: providersRepo,
      automations: automationsRepo,
      automationService: {
        runNow: async (automationId) => {
          if (!automationService) throw new Error('Schedule service is not ready')
          return automationService.runNow(automationId)
        }
      },
      channels: channelsRepo,
      reloadChannels: async () => {
        if (!channelService) throw new Error('Connection service is not ready')
        await channelService.reload()
      },
      workspaces: workspacesRepo,
      mcpServers: mcpServersRepo,
      globalSkillsRoot: join(app.getPath('userData'), 'skills')
    }
  })
  automationService = new AutomationService({
    repository: automationsRepo,
    runtime: agentRuntimeManager,
    providers: providersRepo,
    workspaces: workspacesRepo
  })
  automationService.start()
  channelService = new ChannelService({
    channelsRepo,
    eventBus: channelEventBus,
    adapterFactories: {
      discord: async (channel) => {
        const botToken = channel.config.botToken
        if (typeof botToken !== 'string' || botToken.trim().length === 0) {
          throw new Error(`Channel ${channel.id} is missing required config: botToken`)
        }

        return new DiscordChannel({
          id: channel.id,
          botToken,
          groupRequireMention: resolveGroupRequireMention(channel.config),
          onFatalError: async (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            await channelsRepo.setLastError(channel.id, message)
          }
        })
      },
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
      wechat: async (channel) => {
        return new WechatChannel({
          id: channel.id,
          dataDirectoryPath: join(app.getPath('userData'), 'channels', 'wechat', channel.id),
          authStateStore: wechatAuthStateStore,
          apiBaseUrl:
            typeof channel.config.baseUrl === 'string' && channel.config.baseUrl.trim().length > 0
              ? channel.config.baseUrl
              : undefined,
          onStateChange: async (state) => {
            await channelsRepo.setLastError(
              channel.id,
              state.status === 'error' ? state.errorMessage : null
            )
          },
          onFatalError: async (error) => {
            logger.error(`[WechatChannel:${channel.id}] fatal error:`, error)
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
    bindingsRepo: channelSessionBindingsRepo,
    providersRepo,
    workspacesRepo,
    agentRuntime: agentRuntimeManager
  })

  const apiApp = createApp({
    token: serverConfig.token,
    annotationMode: {
      enabled: isBrowserAnnotationModeEnabled,
      allowedOrigins: annotationAllowedOrigins
    },
    desktop: {
      getDesktopBootstrap: () => resolveDesktopBootstrap(),
      getUiConfig: () => resolveUiConfigStore().getConfig(),
      setUiConfig: (config) => updateUiConfig(config),
      getSystemLocale: () => app.getLocale(),
      getAutoUpdateState: () => autoUpdateService.getState(),
      setAutoUpdateEnabled: async (enabled) => autoUpdateService.setEnabled(enabled),
      checkForUpdates: async () => autoUpdateService.checkForUpdates(),
      restartToUpdate: () => autoUpdateService.restartToUpdate(),
      getManagedRuntimeStatus: async () => resolveManagedRuntimeService().getStatus(),
      checkManagedRuntimeLatest: async (kind) => {
        const state = await resolveManagedRuntimeService().checkLatest(kind)
        await syncManagedRuntimeProcessEnv()
        return state
      },
      installManagedRuntime: async (kind) => {
        const state = await resolveManagedRuntimeService().installManagedRuntime(kind)
        await syncManagedRuntimeProcessEnv()
        return state
      },
      pickCustomRuntime: async (kind) => pickCustomManagedRuntime(kind),
      clearManagedRuntime: async (kind) => {
        const state = await resolveManagedRuntimeService().clearRuntime(kind)
        await syncManagedRuntimeProcessEnv()
        return state
      },
      getRuntimeOnboardingSkillsStatus: async () => getInstalledRecommendedSkills(),
      installRuntimeOnboardingSkills: async (skillIds) =>
        installRuntimeOnboardingSkillsWithManagedBun(skillIds),
      listSkillsCatalogPage: async (query) =>
        listDiscoveredSkillsPage({
          workspaceRootPath: process.cwd(),
          includeWorkspaceSource: false,
          ...query
        }),
      listSkillMarketplace: async () =>
        listSkillMarketplace({
          globalSkillsRoot: join(app.getPath('userData'), 'skills')
        }),
      installMarketplaceSkill: async (input) => {
        await installMarketplaceSkill({
          skillId: input.skillId,
          globalSkillsRoot: join(app.getPath('userData'), 'skills')
        })
      },
      pickDirectory: async () => pickDirectory()
    },
    repositories: {
      providers: providersRepo,
      permissionRules: permissionRulesRepo,
      workspaces: workspacesRepo,
      channels: channelsRepo,
      pairings: channelPairingsRepo,
      webSearchSettings: webSearchSettingsRepo,
      mcpServers: mcpServersRepo,
      mcpServerHealth,
      agentSessions: agentSessionsRepo
    },
    composerMentions: {
      async get(workspacePath) {
        const [skills, files] = await Promise.all([
          listDiscoveredSkills({ workspaceRootPath: workspacePath, includeWorkspaceSource: true }),
          listWorkspaceFiles(workspacePath)
        ])
        return {
          skills: skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            source: skill.source,
            relativePath: skill.relativePath
          })),
          files
        }
      }
    },
    agentRuntime: agentRuntimeManager,
    automations: {
      repository: automationsRepo,
      service: automationService
    },
    channelService,
    channelSetupRecovery: {
      async recover(channel) {
        if (channel.type === 'whatsapp') {
          whatsAppAuthStateStore.clear(channel.id)
          await rm(join(app.getPath('userData'), 'channels', 'whatsapp', channel.id), {
            recursive: true,
            force: true
          })
          return
        }

        if (channel.type === 'wechat') {
          wechatAuthStateStore.clear(channel.id)
          await rm(join(app.getPath('userData'), 'channels', 'wechat', channel.id), {
            recursive: true,
            force: true
          })
        }
      }
    },
    whatsAppAuthStateStore,
    wechatAuthStateStore
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

  if (!localApiServer) {
    return
  }

  localApiServer.close()
  localApiServer = null
}

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const desktopWindowBackgroundColor = '#101214'
  // Create the browser window.
  const browserWindow = new BrowserWindow({
    title: 'TIA Studio',
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(isMac
      ? {
          titleBarStyle: 'hidden' as const,
          backgroundColor: desktopWindowBackgroundColor
        }
      : { backgroundColor: desktopWindowBackgroundColor }),
    ...(process.platform === 'linux'
      ? { icon, backgroundColor: desktopWindowBackgroundColor }
      : {}),
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

  if (is.dev && !process.env['REMOTE_DEBUGGING_PORT']) {
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
    browserWindow.loadURL(attachDesktopBootstrapToRendererUrl(process.env['ELECTRON_RENDERER_URL']))
  } else {
    browserWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: {
        [desktopBootstrapQueryParam]: encodeDesktopBootstrapQueryValue(resolveDesktopBootstrap())
      }
    })
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
  // Browser annotation mode keeps Electron main alive only as the local API host.
  // Loading the renderer here would create a second /chat client alongside localhost:5173.
  if (isBrowserAnnotationModeEnabled) {
    return
  }

  const hasExistingWindow = Boolean(mainWindow && !mainWindow.isDestroyed())
  const browserWindow = resolveMainWindow()
  if (!hasExistingWindow) {
    return
  }

  bringWindowToFront(browserWindow)
}

function createTray(): void {
  if (isBrowserAnnotationModeEnabled || appTray) {
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
electronAutoUpdater.on('before-quit-for-update', () => {
  logAppLifecycle('before-quit-for-update', {
    packaged: app.isPackaged,
    version: app.getVersion()
  })
})

app.on('before-quit', (event) => {
  logAppLifecycle('before-quit', {
    packaged: app.isPackaged,
    version: app.getVersion()
  })
  if (gracefulQuitStarted) {
    return
  }
  event.preventDefault()
  gracefulQuitStarted = true
  if (appTray) {
    appTray.destroy()
    appTray = null
  }
  void (async () => {
    automationService?.stop()
    automationService = null
    await agentRuntimeManager?.shutdown()
    agentRuntimeManager = null
    stopLocalApiServer()
    app.quit()
  })()
})

app.on('will-quit', () => {
  logAppLifecycle('will-quit', {
    packaged: app.isPackaged,
    version: app.getVersion()
  })
})

app.on('quit', (_event, exitCode) => {
  logAppLifecycle('quit', {
    exitCode,
    packaged: app.isPackaged,
    version: app.getVersion()
  })
  logger.close()
})

app.on('window-all-closed', () => {
  logAppLifecycle('window-all-closed', {
    packaged: app.isPackaged,
    version: app.getVersion()
  })
  // Keep the process alive so the tray menu can reopen the window.
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

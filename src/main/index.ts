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
import { readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { serve, type ServerType } from '@hono/node-server'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { AutoUpdateService } from './auto-updater'
import { resolveServerConfig } from './config/server-config'
import { ensureBuiltInDefaultAgent } from './default-agent/default-agent-bootstrap'
import { AssistantRuntimeService } from './mastra/assistant-runtime'
import { createMastraInstance } from './mastra/store'
import { migrateAppSchema } from './persistence/migrate'
import { AssistantsRepository } from './persistence/repos/assistants-repo'
import { McpServersRepository } from './persistence/repos/mcp-servers-repo'
import { ProvidersRepository } from './persistence/repos/providers-repo'
import { ThreadsRepository } from './persistence/repos/threads-repo'
import { WebSearchSettingsRepository } from './persistence/repos/web-search-settings-repo'
import { createApp } from './server/create-app'
import { listAssistantSkills, removeWorkspaceSkill } from './skills/skills-manager'
import { bringWindowToFront, buildTrayMenuTemplate } from './tray'

const serverConfig = resolveServerConfig({})
const autoUpdateService = new AutoUpdateService({
  app,
  updater: autoUpdater
})
let localApiServer: ServerType | null = null
let persistenceDatabasePath: string | null = null
let appTray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let webSearchSettingsWindow: BrowserWindow | null = null
const searchBrowserPartition = 'persist:tia-browser-search'

let isTransparentWindow = false
try {
  const uiConfig = JSON.parse(
    readFileSync(join(app.getPath('userData'), 'ui-config.json'), 'utf-8')
  )
  isTransparentWindow = Boolean(uiConfig.transparent)
} catch {
  // Ignore
}

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
      partition: searchBrowserPartition
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

  persistenceDatabasePath = join(app.getPath('userData'), 'tia-studio.db')
  const db = await migrateAppSchema(persistenceDatabasePath)
  const providersRepo = new ProvidersRepository(db)
  const assistantsRepo = new AssistantsRepository(db)
  const threadsRepo = new ThreadsRepository(db)
  const webSearchSettingsRepo = new WebSearchSettingsRepository(db)
  const mcpServersRepo = new McpServersRepository(join(app.getPath('userData'), 'mcp.json'))
  await ensureBuiltInDefaultAgent({
    assistantsRepo,
    providersRepo,
    userDataPath: app.getPath('userData')
  })
  const mastra = await createMastraInstance(join(app.getPath('userData'), 'mastra.db'))
  const assistantRuntime = new AssistantRuntimeService({
    mastra,
    assistantsRepo,
    providersRepo,
    threadsRepo,
    webSearchSettingsRepo,
    mcpServersRepo
  })

  const apiApp = createApp({
    token: serverConfig.token,
    repositories: {
      providers: providersRepo,
      assistants: assistantsRepo,
      threads: threadsRepo,
      webSearchSettings: webSearchSettingsRepo,
      mcpServers: mcpServersRepo
    },
    assistantRuntime
  })

  localApiServer = serve(
    {
      fetch: apiApp.fetch,
      hostname: serverConfig.host,
      port: serverConfig.port
    },
    (serverInfo) => {
      console.log(
        `Tia local API is running on http://${serverInfo.address}:${serverInfo.port} (localhost only)`
      )
      if (persistenceDatabasePath) {
        console.log(`Tia database path: ${persistenceDatabasePath}`)
      }
    }
  )
}

function stopLocalApiServer(): void {
  if (!localApiServer) {
    return
  }

  localApiServer.close()
  localApiServer = null
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
  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle('tia:get-desktop-config', () => {
    return {
      baseUrl: `http://${serverConfig.host}:${serverConfig.port}`,
      authToken: serverConfig.token
    }
  })
  ipcMain.handle('tia:get-ui-config', () => {
    return { transparent: isTransparentWindow }
  })
  ipcMain.handle('tia:set-ui-config', (_event, config) => {
    try {
      const existingStr = readFileSync(join(app.getPath('userData'), 'ui-config.json'), 'utf-8')
      const existing = JSON.parse(existingStr)
      writeFileSync(
        join(app.getPath('userData'), 'ui-config.json'),
        JSON.stringify({ ...existing, ...config })
      )
    } catch {
      writeFileSync(join(app.getPath('userData'), 'ui-config.json'), JSON.stringify(config))
    }
    isTransparentWindow = config.transparent
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
      console.error('Initial auto update check failed:', error)
    })
  }

  app.on('activate', function () {
    openMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('before-quit', () => {
  if (appTray) {
    appTray.destroy()
    appTray = null
  }
  stopLocalApiServer()
})

app.on('window-all-closed', () => {
  // Keep the process alive so the tray menu can reopen the window.
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

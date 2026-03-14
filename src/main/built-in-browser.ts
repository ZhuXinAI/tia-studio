import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import {
  BUILT_IN_BROWSER_HANDOFF_DONE_MARKER,
  BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT,
  type BuiltInBrowserControlMessage,
  type BuiltInBrowserEventMessage
} from './built-in-browser-contract'

type ActiveHandoff = {
  requestId: string
  message: string
  buttonLabel: string
}

const PARENT_WATCHDOG_INTERVAL_MS = 250

let browserWindow: BrowserWindow | null = null
let activeHandoff: ActiveHandoff | null = null

const profilePath = process.env.TIA_BUILT_IN_BROWSER_PROFILE_PATH?.trim()
if (profilePath) {
  app.setPath('userData', profilePath)
  app.setPath('sessionData', join(profilePath, 'session-data'))
}

function sendToParent(message: BuiltInBrowserEventMessage): void {
  if (typeof process.send === 'function') {
    process.send(message)
  }
}

function resolveRemoteDebuggingPort(): number {
  const envPort = Number.parseInt(process.env.TIA_BUILT_IN_BROWSER_PORT ?? '', 10)
  if (Number.isFinite(envPort) && envPort > 0) {
    return envPort
  }

  return BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT
}

function resolveParentPid(): number | null {
  const parentPid = Number.parseInt(process.env.TIA_BUILT_IN_BROWSER_PARENT_PID ?? '', 10)
  return Number.isFinite(parentPid) && parentPid > 0 ? parentPid : null
}

function getCurrentUrl(): string {
  const currentWindow = browserWindow
  if (!currentWindow || currentWindow.isDestroyed()) {
    return 'about:blank'
  }

  return currentWindow.webContents.getURL() || 'about:blank'
}

function publishWindowState(): void {
  const currentWindow = browserWindow
  sendToParent({
    type: 'window-state',
    visible: Boolean(currentWindow && !currentWindow.isDestroyed() && currentWindow.isVisible()),
    currentUrl: getCurrentUrl()
  })
}

async function injectHandoffOverlay(handoff: ActiveHandoff): Promise<void> {
  const currentWindow = browserWindow
  if (!currentWindow || currentWindow.isDestroyed()) {
    throw new Error('Built-in browser window is not available.')
  }

  const serializedHandoff = JSON.stringify(handoff)
  await currentWindow.webContents.executeJavaScript(
    `
      (() => {
        const handoff = ${serializedHandoff}
        const overlayId = '__tia_built_in_browser_handoff__'
        const existing = document.getElementById(overlayId)
        if (existing) {
          existing.remove()
        }

        const overlay = document.createElement('div')
        overlay.id = overlayId
        overlay.style.cssText = [
          'position: fixed',
          'right: 24px',
          'bottom: 24px',
          'z-index: 2147483647',
          'max-width: min(420px, calc(100vw - 48px))',
          'padding: 16px',
          'border-radius: 16px',
          'background: rgba(17, 24, 39, 0.96)',
          'color: white',
          'box-shadow: 0 18px 50px rgba(15, 23, 42, 0.35)',
          'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          'line-height: 1.45'
        ].join(';')

        const title = document.createElement('div')
        title.textContent = 'Human step needed'
        title.style.cssText = 'font-size: 14px; font-weight: 700; margin-bottom: 8px;'
        overlay.appendChild(title)

        const message = document.createElement('div')
        message.textContent = handoff.message
        message.style.cssText = 'font-size: 13px; margin-bottom: 12px;'
        overlay.appendChild(message)

        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = handoff.buttonLabel
        button.style.cssText = [
          'appearance: none',
          'border: 0',
          'border-radius: 999px',
          'padding: 10px 14px',
          'font-size: 13px',
          'font-weight: 600',
          'cursor: pointer',
          'background: #f8fafc',
          'color: #0f172a'
        ].join(';')
        button.addEventListener('click', () => {
          console.log('${BUILT_IN_BROWSER_HANDOFF_DONE_MARKER}:' + handoff.requestId)
          overlay.remove()
        })
        overlay.appendChild(button)

        document.documentElement.appendChild(overlay)
      })();
    `,
    true
  )
}

async function clearHandoffOverlay(): Promise<void> {
  const currentWindow = browserWindow
  if (!currentWindow || currentWindow.isDestroyed()) {
    return
  }

  await currentWindow.webContents.executeJavaScript(
    `
      (() => {
        document.getElementById('__tia_built_in_browser_handoff__')?.remove()
      })();
    `,
    true
  )
}

async function handleMessage(message: BuiltInBrowserControlMessage): Promise<void> {
  const currentWindow = browserWindow
  if (!currentWindow || currentWindow.isDestroyed()) {
    throw new Error('Built-in browser window is not ready.')
  }

  switch (message.type) {
    case 'show-window':
      currentWindow.show()
      currentWindow.focus()
      publishWindowState()
      return
    case 'hide-window':
      currentWindow.hide()
      publishWindowState()
      return
    case 'request-human-handoff':
      activeHandoff = {
        requestId: message.requestId,
        message: message.message,
        buttonLabel: message.buttonLabel
      }
      currentWindow.show()
      currentWindow.focus()
      await injectHandoffOverlay(activeHandoff)
      sendToParent({
        type: 'human-handoff-opened',
        requestId: message.requestId,
        currentUrl: getCurrentUrl()
      })
      publishWindowState()
      return
    case 'clear-human-handoff':
      if (!activeHandoff || !message.requestId || activeHandoff.requestId === message.requestId) {
        activeHandoff = null
        await clearHandoffOverlay()
      }
      return
    case 'quit':
      app.quit()
  }
}

function scheduleParentWatchdog(): void {
  const expectedParentPid = resolveParentPid()
  if (!expectedParentPid) {
    return
  }

  const interval = setInterval(() => {
    if (process.ppid === expectedParentPid) {
      return
    }

    app.quit()
  }, PARENT_WATCHDOG_INTERVAL_MS)

  interval.unref()
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    autoHideMenuBar: true,
    title: 'TIA Built-in Browser',
    webPreferences: {
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  window.on('show', () => {
    publishWindowState()
  })
  window.on('hide', () => {
    publishWindowState()
  })
  window.on('closed', () => {
    browserWindow = null
    app.quit()
  })

  window.webContents.on('console-message', (_event, _level, message) => {
    if (!message.startsWith(`${BUILT_IN_BROWSER_HANDOFF_DONE_MARKER}:`)) {
      return
    }

    const requestId = message.slice(`${BUILT_IN_BROWSER_HANDOFF_DONE_MARKER}:`.length)
    if (!activeHandoff || activeHandoff.requestId !== requestId) {
      return
    }

    activeHandoff = null
    sendToParent({
      type: 'human-handoff-completed',
      requestId,
      currentUrl: getCurrentUrl()
    })
  })
  window.webContents.on('dom-ready', () => {
    if (!activeHandoff) {
      return
    }

    void injectHandoffOverlay(activeHandoff).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown handoff injection failure.'
      sendToParent({
        type: 'error',
        code: 'handoff-failed',
        requestId: activeHandoff?.requestId,
        message
      })
    })
  })
  window.webContents.on('did-navigate', () => {
    publishWindowState()
  })
  window.webContents.on('did-navigate-in-page', () => {
    publishWindowState()
  })
  window.webContents.setWindowOpenHandler((details) => {
    void window.loadURL(details.url)
    return { action: 'deny' }
  })

  return window
}

export function browserMain() {
  app.whenReady().then(async () => {
    app.dock?.hide()
    scheduleParentWatchdog()
    browserWindow = createWindow()
    await browserWindow.loadURL('about:blank')
    sendToParent({
      type: 'ready',
      remoteDebuggingPort: resolveRemoteDebuggingPort(),
      visible: browserWindow.isVisible(),
      currentUrl: getCurrentUrl()
    })
  })

  process.on('disconnect', () => {
    app.quit()
  })
  process.on('message', (message: BuiltInBrowserControlMessage) => {
    void handleMessage(message).catch((error) => {
      const activeRequestId =
        message.type === 'request-human-handoff' ? message.requestId : activeHandoff?.requestId
      const messageText =
        error instanceof Error ? error.message : 'Unknown built-in browser command failure.'
      sendToParent({
        type: 'error',
        code: 'handoff-failed',
        requestId: activeRequestId,
        message: messageText
      })
    })
  })
  app.on('window-all-closed', () => {
    app.quit()
  })
}

browserMain()

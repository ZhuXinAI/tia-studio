import { contextBridge, ipcRenderer } from 'electron'
import type { TiaStudioApi } from '../shared/browser'
import { browserIpcChannels } from '../shared/browser'
import { browserCdpIpcChannels } from '../shared/browser-cdp'

const browserCdp: TiaStudioApi['browser']['cdp'] = {
  sendCommand: (tabId, method, params) =>
    ipcRenderer.invoke(browserCdpIpcChannels.command, tabId, method, params),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      listener(payload as Parameters<typeof listener>[0])
    }
    ipcRenderer.on(browserCdpIpcChannels.event, handler)
    return () => ipcRenderer.removeListener(browserCdpIpcChannels.event, handler)
  },
  onDetach: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      listener(payload as Parameters<typeof listener>[0])
    }
    ipcRenderer.on(browserCdpIpcChannels.detached, handler)
    return () => ipcRenderer.removeListener(browserCdpIpcChannels.detached, handler)
  }
}

const browser: TiaStudioApi['browser'] = {
  getState: () => ipcRenderer.invoke(browserIpcChannels.getState),
  createTab: (url) => ipcRenderer.invoke(browserIpcChannels.createTab, url),
  closeTab: (tabId) => ipcRenderer.invoke(browserIpcChannels.closeTab, tabId),
  activateTab: (tabId) => ipcRenderer.invoke(browserIpcChannels.activateTab, tabId),
  navigate: (tabId, url) => ipcRenderer.invoke(browserIpcChannels.navigate, tabId, url),
  reload: (tabId) => ipcRenderer.invoke(browserIpcChannels.reload, tabId),
  goBack: (tabId) => ipcRenderer.invoke(browserIpcChannels.goBack, tabId),
  goForward: (tabId) => ipcRenderer.invoke(browserIpcChannels.goForward, tabId),
  stop: (tabId) => ipcRenderer.invoke(browserIpcChannels.stop, tabId),
  setViewBounds: (bounds) => ipcRenderer.send(browserIpcChannels.setViewBounds, bounds),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      listener(state as Parameters<typeof listener>[0])
    }
    ipcRenderer.on(browserIpcChannels.state, handler)
    return () => ipcRenderer.removeListener(browserIpcChannels.state, handler)
  },
  cdp: browserCdp
}

const api: TiaStudioApi = { browser }

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('tiaStudio', api)
} else {
  Object.assign(window, { tiaStudio: api })
}

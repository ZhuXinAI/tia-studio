import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}
const tiaDesktop = {
  getConfig: () =>
    ipcRenderer.invoke('tia:get-desktop-config') as Promise<{
      baseUrl: string
      authToken: string
    }>,
  pickDirectory: () => ipcRenderer.invoke('tia:pick-directory') as Promise<string | null>
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('tiaDesktop', tiaDesktop)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.tiaDesktop = tiaDesktop
}

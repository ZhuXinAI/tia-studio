import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}
type AutoUpdateState = {
  enabled: boolean
  status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'unsupported' | 'error'
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}
type ManagedRuntimeKind = 'bun' | 'uv'
type ManagedRuntimeSource = 'managed' | 'custom' | 'none'
type ManagedRuntimeStatus =
  | 'missing'
  | 'installing'
  | 'ready'
  | 'custom-ready'
  | 'update-available'
  | 'invalid-custom-path'
  | 'download-failed'
  | 'extract-failed'
  | 'validation-failed'
type ManagedRuntimeRecord = {
  source: ManagedRuntimeSource
  binaryPath: string | null
  version: string | null
  installedAt: string | null
  lastCheckedAt: string | null
  releaseUrl: string | null
  checksum: string | null
  status: ManagedRuntimeStatus
  errorMessage: string | null
}
type ManagedRuntimesState = Record<ManagedRuntimeKind, ManagedRuntimeRecord>

const tiaDesktop = {
  getConfig: () =>
    ipcRenderer.invoke('tia:get-desktop-config') as Promise<{
      baseUrl: string
      authToken: string
    }>,
  getAppInfo: () =>
    ipcRenderer.invoke('tia:get-app-info') as Promise<{
      name: string
      version: string
    }>,
  getAutoUpdateState: () =>
    ipcRenderer.invoke('tia:get-auto-update-state') as Promise<AutoUpdateState>,
  setAutoUpdateEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('tia:set-auto-update-enabled', enabled) as Promise<AutoUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('tia:check-for-updates') as Promise<AutoUpdateState>,
  getManagedRuntimeStatus: () =>
    ipcRenderer.invoke('tia:get-managed-runtime-status') as Promise<ManagedRuntimesState>,
  checkManagedRuntimeLatest: (kind: ManagedRuntimeKind) =>
    ipcRenderer.invoke('tia:check-managed-runtime-latest', kind) as Promise<ManagedRuntimesState>,
  installManagedRuntime: (kind: ManagedRuntimeKind) =>
    ipcRenderer.invoke('tia:install-managed-runtime', kind) as Promise<ManagedRuntimesState>,
  pickCustomRuntime: (kind: ManagedRuntimeKind) =>
    ipcRenderer.invoke('tia:pick-custom-runtime', kind) as Promise<ManagedRuntimesState | null>,
  clearManagedRuntime: (kind: ManagedRuntimeKind) =>
    ipcRenderer.invoke('tia:clear-managed-runtime', kind) as Promise<ManagedRuntimesState>,
  pickDirectory: () => ipcRenderer.invoke('tia:pick-directory') as Promise<string | null>,
  listAssistantSkills: (workspaceRootPath: string) =>
    ipcRenderer.invoke('tia:list-assistant-skills', workspaceRootPath) as Promise<
      Array<{
        id: string
        name: string
        description: string | null
        source: 'global-claude' | 'global-agent' | 'workspace'
        sourceRootPath: string
        directoryPath: string
        relativePath: string
        skillFilePath: string
        canDelete: boolean
      }>
    >,
  removeAssistantWorkspaceSkill: (workspaceRootPath: string, relativePath: string) =>
    ipcRenderer.invoke(
      'tia:remove-assistant-workspace-skill',
      workspaceRootPath,
      relativePath
    ) as Promise<void>,
  openWebSearchSettings: (url: string) =>
    ipcRenderer.invoke('tia:open-web-search-settings', url) as Promise<boolean>
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

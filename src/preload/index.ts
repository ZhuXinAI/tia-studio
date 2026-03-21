import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}
const autoUpdateStateChangedChannel = 'tia:auto-update-state-changed'
type AutoUpdateState = {
  enabled: boolean
  status:
    | 'idle'
    | 'checking'
    | 'update-available'
    | 'update-downloaded'
    | 'up-to-date'
    | 'unsupported'
    | 'error'
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}
type ManagedRuntimeKind =
  | 'agent-browser'
  | 'bun'
  | 'uv'
  | 'codex-acp'
  | 'claude-agent-acp'
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
type RecommendedSkillId = 'agent-browser' | 'find-skills'
type UiConfig = {
  transparent?: boolean
  language?: string | null
}

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
  getUiConfig: () => ipcRenderer.invoke('tia:get-ui-config') as Promise<UiConfig>,
  setUiConfig: (config: UiConfig) =>
    ipcRenderer.invoke('tia:set-ui-config', config) as Promise<UiConfig>,
  getSystemLocale: () => ipcRenderer.invoke('tia:get-system-locale') as Promise<string>,
  getAutoUpdateState: () =>
    ipcRenderer.invoke('tia:get-auto-update-state') as Promise<AutoUpdateState>,
  setAutoUpdateEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('tia:set-auto-update-enabled', enabled) as Promise<AutoUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('tia:check-for-updates') as Promise<AutoUpdateState>,
  restartToUpdate: () => ipcRenderer.invoke('tia:restart-to-update') as Promise<void>,
  onAutoUpdateStateChanged: (listener: (state: AutoUpdateState) => void) => {
    const handleStateChange = (_event: Electron.IpcRendererEvent, nextState: AutoUpdateState) => {
      listener(nextState)
    }
    ipcRenderer.on(autoUpdateStateChangedChannel, handleStateChange)

    return () => {
      ipcRenderer.removeListener(autoUpdateStateChangedChannel, handleStateChange)
    }
  },
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
  getRuntimeOnboardingSkillsStatus: () =>
    ipcRenderer.invoke('tia:get-runtime-onboarding-skills-status') as Promise<RecommendedSkillId[]>,
  installRuntimeOnboardingSkills: (skillIds: RecommendedSkillId[]) =>
    ipcRenderer.invoke('tia:install-runtime-onboarding-skills', skillIds) as Promise<
      RecommendedSkillId[]
    >,
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
    ) as Promise<void>
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

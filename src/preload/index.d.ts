import { ElectronAPI } from '@electron-toolkit/preload'

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

interface TiaDesktopAPI {
  listAssistantSkills?: (workspaceRootPath: string) => Promise<
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
  >
  removeAssistantWorkspaceSkill?: (workspaceRootPath: string, relativePath: string) => Promise<void>
  getConfig: () => Promise<{
    baseUrl: string
    authToken: string
  }>
  getAppInfo?: () => Promise<{
    name: string
    version: string
  }>
  getAutoUpdateState?: () => Promise<{
    enabled: boolean
    status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'unsupported' | 'error'
    availableVersion: string | null
    lastCheckedAt: string | null
    message: string | null
  }>
  setAutoUpdateEnabled?: (enabled: boolean) => Promise<{
    enabled: boolean
    status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'unsupported' | 'error'
    availableVersion: string | null
    lastCheckedAt: string | null
    message: string | null
  }>
  checkForUpdates?: () => Promise<{
    enabled: boolean
    status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'unsupported' | 'error'
    availableVersion: string | null
    lastCheckedAt: string | null
    message: string | null
  }>
  getManagedRuntimeStatus?: () => Promise<ManagedRuntimesState>
  checkManagedRuntimeLatest?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  installManagedRuntime?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  pickCustomRuntime?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState | null>
  clearManagedRuntime?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  pickDirectory: () => Promise<string | null>
  openWebSearchSettings?: (url: string) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    tiaDesktop: TiaDesktopAPI
  }
}

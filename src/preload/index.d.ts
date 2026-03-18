import { ElectronAPI } from '@electron-toolkit/preload'

type ManagedRuntimeKind = 'agent-browser' | 'bun' | 'uv'
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
type CodexCliStatus = {
  available: boolean
  version: string | null
  errorMessage: string | null
}
type RecommendedSkillId = 'agent-browser' | 'find-skills'
type UiConfig = {
  transparent?: boolean
  language?: string | null
}

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
  getUiConfig?: () => Promise<UiConfig>
  setUiConfig?: (config: UiConfig) => Promise<UiConfig>
  getSystemLocale?: () => Promise<string>
  getAutoUpdateState?: () => Promise<{
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
  }>
  setAutoUpdateEnabled?: (enabled: boolean) => Promise<{
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
  }>
  checkForUpdates?: () => Promise<{
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
  }>
  getCodexCliStatus?: () => Promise<CodexCliStatus>
  restartToUpdate?: () => Promise<void>
  onAutoUpdateStateChanged?: (
    listener: (state: {
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
    }) => void
  ) => () => void
  getManagedRuntimeStatus?: () => Promise<ManagedRuntimesState>
  checkManagedRuntimeLatest?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  installManagedRuntime?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  pickCustomRuntime?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState | null>
  clearManagedRuntime?: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  getRuntimeOnboardingSkillsStatus?: () => Promise<RecommendedSkillId[]>
  installRuntimeOnboardingSkills?: (skillIds: RecommendedSkillId[]) => Promise<RecommendedSkillId[]>
  pickDirectory: () => Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    tiaDesktop: TiaDesktopAPI
  }
}

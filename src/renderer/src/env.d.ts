/// <reference types="vite/client" />

declare global {
  interface Window {
    tiaDesktop: {
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
      removeAssistantWorkspaceSkill?: (
        workspaceRootPath: string,
        relativePath: string
      ) => Promise<void>
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
      pickDirectory: () => Promise<string | null>
      openWebSearchSettings?: (url: string) => Promise<boolean>
    }
  }
}

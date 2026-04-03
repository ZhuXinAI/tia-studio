/// <reference types="vite/client" />

declare global {
  interface Window {
    tiaDesktop: {
      getRuntimeOnboardingSkillsStatus?: () => Promise<Array<'agent-browser' | 'find-skills'>>
      installRuntimeOnboardingSkills?: (
        skillIds: Array<'agent-browser' | 'find-skills'>
      ) => Promise<Array<'agent-browser' | 'find-skills'>>
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
      pickDirectory: () => Promise<string | null>
      listInstalledLocalAcpAgents?: () => Promise<
        Array<{
          key: 'codex' | 'claude' | 'gemini' | 'qwen-code' | 'openclaw'
          label: string
          resolvedCommand: string
          binaryPath: string
        }>
      >
    }
  }
}

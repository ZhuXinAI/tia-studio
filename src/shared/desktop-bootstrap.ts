export const desktopBootstrapQueryParam = 'desktopBootstrap'

export type DesktopAuthMode = 'bearer' | 'none'

export type DesktopBootstrap = {
  apiBaseUrl: string
  authMode: DesktopAuthMode
  authToken?: string
  app: {
    name: string
    version: string
    platform: 'darwin' | 'win32' | 'linux'
  }
  capabilities: {
    autoUpdate: boolean
    managedRuntimes: boolean
    nativeDirectoryPicker: boolean
    runtimeOnboarding: boolean
  }
}

import { ElectronAPI } from '@electron-toolkit/preload'

interface TiaDesktopAPI {
  getConfig: () => Promise<{
    baseUrl: string
    authToken: string
  }>
  pickDirectory: () => Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    tiaDesktop: TiaDesktopAPI
  }
}

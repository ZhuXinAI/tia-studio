export type DesktopConfig = {
  baseUrl: string
  authToken: string
}

const fallbackConfig: DesktopConfig = {
  baseUrl: 'http://127.0.0.1:4769',
  authToken: ''
}

let cachedConfig: Promise<DesktopConfig> | null = null

export async function getDesktopConfig(): Promise<DesktopConfig> {
  if (!cachedConfig) {
    cachedConfig = window.tiaDesktop
      .getConfig()
      .then((config) => {
        return {
          baseUrl: config.baseUrl,
          authToken: config.authToken
        }
      })
      .catch(() => fallbackConfig)
  }

  return cachedConfig
}

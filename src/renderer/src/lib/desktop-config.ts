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
  const getConfig = window.tiaDesktop?.getConfig
  if (!getConfig) {
    return fallbackConfig
  }

  if (!cachedConfig) {
    cachedConfig = getConfig()
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

export type RendererUiConfig = {
  transparent?: boolean
  language?: string | null
}

export async function getUiConfig(): Promise<RendererUiConfig> {
  const getDesktopUiConfig = window.tiaDesktop?.getUiConfig

  if (!getDesktopUiConfig) {
    return {}
  }

  try {
    return await getDesktopUiConfig()
  } catch {
    return {}
  }
}

export async function setUiConfig(config: RendererUiConfig): Promise<RendererUiConfig> {
  const setDesktopUiConfig = window.tiaDesktop?.setUiConfig

  if (!setDesktopUiConfig) {
    return config
  }

  try {
    return await setDesktopUiConfig(config)
  } catch {
    return config
  }
}

export async function getSystemLocale(): Promise<string> {
  const getDesktopSystemLocale = window.tiaDesktop?.getSystemLocale

  if (!getDesktopSystemLocale) {
    return 'en-US'
  }

  try {
    return await getDesktopSystemLocale()
  } catch {
    return 'en-US'
  }
}

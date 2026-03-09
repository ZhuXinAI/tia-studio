import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getSystemLocale, getUiConfig } from '../features/settings/ui-config'
import { fallbackLocale, resolveEffectiveLocale } from './config'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'
import zhHK from './locales/zh-HK.json'
import deDE from './locales/de-DE.json'
import jaJP from './locales/ja-JP.json'
import ruRU from './locales/ru-RU.json'
import elGR from './locales/el-GR.json'
import esES from './locales/es-ES.json'
import frFR from './locales/fr-FR.json'
import ptPT from './locales/pt-PT.json'
import roRO from './locales/ro-RO.json'

const defaultNamespace = 'app'

const resources = {
  'en-US': {
    [defaultNamespace]: enUS
  },
  'zh-CN': {
    [defaultNamespace]: zhCN
  },
  'zh-HK': {
    [defaultNamespace]: zhHK
  },
  'de-DE': {
    [defaultNamespace]: deDE
  },
  'ja-JP': {
    [defaultNamespace]: jaJP
  },
  'ru-RU': {
    [defaultNamespace]: ruRU
  },
  'el-GR': {
    [defaultNamespace]: elGR
  },
  'es-ES': {
    [defaultNamespace]: esES
  },
  'fr-FR': {
    [defaultNamespace]: frFR
  },
  'pt-PT': {
    [defaultNamespace]: ptPT
  },
  'ro-RO': {
    [defaultNamespace]: roRO
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: fallbackLocale,
    fallbackLng: fallbackLocale,
    defaultNS: defaultNamespace,
    debug: false,
    interpolation: {
      escapeValue: false
    },
    initImmediate: false
  })
}

export async function applyResolvedLanguage(): Promise<string> {
  const uiConfig = await getUiConfig()
  const systemLocale = await getSystemLocale()
  const nextLocale = resolveEffectiveLocale(uiConfig.language, systemLocale)

  await i18n.changeLanguage(nextLocale)
  return nextLocale
}

export { i18n }

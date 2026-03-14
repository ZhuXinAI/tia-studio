import type { UIMessageChunk } from 'ai'
import { supportedUiLanguages, type UiLanguage } from '../ui-config'

const FALLBACK_LOCALE: UiLanguage = 'en-US'

type ToolInputAvailableChunk = Extract<UIMessageChunk, { type: 'tool-input-available' }>

type ChannelProgressMessages = {
  usingTool: string
}

type ChannelInterruptionMessages = {
  interrupt: string
  queue: string
}

const channelProgressMessages: Record<UiLanguage, ChannelProgressMessages> = {
  'en-US': {
    usingTool: 'Using tool: {{tool}}'
  },
  'zh-CN': {
    usingTool: '正在使用工具：{{tool}}'
  },
  'zh-HK': {
    usingTool: '正在使用工具：{{tool}}'
  },
  'de-DE': {
    usingTool: 'Verwende Tool: {{tool}}'
  },
  'ja-JP': {
    usingTool: 'ツールを使用中: {{tool}}'
  },
  'ru-RU': {
    usingTool: 'Используется инструмент: {{tool}}'
  },
  'el-GR': {
    usingTool: 'Χρήση εργαλείου: {{tool}}'
  },
  'es-ES': {
    usingTool: 'Usando herramienta: {{tool}}'
  },
  'fr-FR': {
    usingTool: "Utilisation de l'outil : {{tool}}"
  },
  'pt-PT': {
    usingTool: 'A usar ferramenta: {{tool}}'
  },
  'ro-RO': {
    usingTool: 'Se folosește instrumentul: {{tool}}'
  }
}

const channelInterruptionMessages: Record<UiLanguage, ChannelInterruptionMessages> = {
  'en-US': {
    interrupt: 'Understood — pausing the current reply and switching now.',
    queue: 'Got it — I’ll handle this right after the current reply.'
  },
  'zh-CN': {
    interrupt: '明白，我先暂停当前回复，马上切换处理这条消息。',
    queue: '好的，我会在当前回复结束后立刻处理这条消息。'
  },
  'zh-HK': {
    interrupt: '明白，我先暫停目前回覆，馬上切換處理這則訊息。',
    queue: '好的，我會在目前回覆結束後立刻處理這則訊息。'
  },
  'de-DE': {
    interrupt: 'Verstanden — ich pausiere die aktuelle Antwort und wechsle jetzt.',
    queue: 'Verstanden — ich kümmere mich direkt nach der aktuellen Antwort darum.'
  },
  'ja-JP': {
    interrupt: '承知しました。現在の返信をいったん止めて、すぐに切り替えます。',
    queue: '承知しました。現在の返信が終わり次第、すぐに対応します。'
  },
  'ru-RU': {
    interrupt: 'Понял — ставлю текущий ответ на паузу и переключаюсь сейчас.',
    queue: 'Понял — займусь этим сразу после текущего ответа.'
  },
  'el-GR': {
    interrupt: 'Έγινε κατανοητό — βάζω σε παύση την τρέχουσα απάντηση και αλλάζω τώρα.',
    queue: 'Έγινε κατανοητό — θα το αναλάβω αμέσως μετά την τρέχουσα απάντηση.'
  },
  'es-ES': {
    interrupt: 'Entendido: pauso la respuesta actual y cambio ahora.',
    queue: 'Entendido: me encargaré de esto justo después de la respuesta actual.'
  },
  'fr-FR': {
    interrupt: 'Compris, je mets la réponse en cours en pause et je bascule maintenant.',
    queue: 'Compris, je m’en occupe juste après la réponse en cours.'
  },
  'pt-PT': {
    interrupt: 'Percebi — vou pausar a resposta atual e mudar já.',
    queue: 'Percebi — trato disto logo a seguir à resposta atual.'
  },
  'ro-RO': {
    interrupt: 'Am înțeles — pun pe pauză răspunsul curent și schimb acum.',
    queue: 'Am înțeles — mă ocup de asta imediat după răspunsul curent.'
  }
}

const toolNameOverrides: Record<string, string> = {
  webFetch: 'Web Fetch',
  createCronJob: 'Create Reminder',
  getRecentConversations: 'Get Recent Conversations',
  readSoulMemory: 'Read Soul Memory',
  readWorkLog: 'Read Work Log',
  removeCronJob: 'Remove Reminder',
  searchWorkLogs: 'Search Work Logs',
  sendFile: 'Send File',
  sendImage: 'Send Image',
  sendMessageToChannel: 'Send Message To Channel',
  updateSoulMemory: 'Update Soul Memory',
  writeSoulMemory: 'Update Soul Memory',
  writeWorkLog: 'Write Work Log'
}

function canonicalizeLocaleTag(rawLocale: string): string {
  const normalizedValue = rawLocale.trim().replaceAll('_', '-')
  if (!normalizedValue) {
    return ''
  }

  try {
    return new Intl.Locale(normalizedValue).baseName
  } catch {
    return normalizedValue
  }
}

export function resolveChannelProgressLocale(rawLocale: string | null | undefined): UiLanguage {
  const canonicalValue = rawLocale ? canonicalizeLocaleTag(rawLocale) : ''
  const directMatch = supportedUiLanguages.find(
    (locale) => locale.toLowerCase() === canonicalValue.toLowerCase()
  )

  if (directMatch) {
    return directMatch
  }

  if (!canonicalValue) {
    return FALLBACK_LOCALE
  }

  try {
    const locale = new Intl.Locale(canonicalValue)
    const language = locale.language.toLowerCase()
    const script = locale.script?.toLowerCase()
    const region = locale.region?.toUpperCase()

    if (language === 'zh') {
      if (script === 'hant' || region === 'TW' || region === 'HK' || region === 'MO') {
        return 'zh-HK'
      }

      return 'zh-CN'
    }

    switch (language) {
      case 'de':
        return 'de-DE'
      case 'el':
        return 'el-GR'
      case 'es':
        return 'es-ES'
      case 'fr':
        return 'fr-FR'
      case 'ja':
        return 'ja-JP'
      case 'pt':
        return 'pt-PT'
      case 'ro':
        return 'ro-RO'
      case 'ru':
        return 'ru-RU'
      default:
        return FALLBACK_LOCALE
    }
  } catch {
    return FALLBACK_LOCALE
  }
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template
  )
}

function resolveToolLabel(tool: { toolName: string; title?: string }): string {
  const title = typeof tool.title === 'string' ? tool.title.trim() : ''
  if (title.length > 0) {
    return title
  }

  const override = toolNameOverrides[tool.toolName]
  if (override) {
    return override
  }

  const normalized = tool.toolName
    .replace(/^mastra[_-]/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 0) {
    return tool.toolName
  }

  return normalized.replace(/\b\w/g, (segment) => segment.toUpperCase())
}

export function formatChannelToolInputUpdate(
  chunk: ToolInputAvailableChunk,
  rawLocale?: string | null
): string {
  const locale = resolveChannelProgressLocale(rawLocale)
  const messages = channelProgressMessages[locale]
  const header = fillTemplate(messages.usingTool, {
    tool: resolveToolLabel({
      toolName: chunk.toolName,
      title: chunk.title
    })
  })
  return header
}

export function formatChannelInterruptionReply(
  decision: 'interrupt' | 'queue',
  rawLocale?: string | null
): string {
  const locale = resolveChannelProgressLocale(rawLocale)
  return channelInterruptionMessages[locale][decision]
}

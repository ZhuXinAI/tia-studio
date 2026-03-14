import { describe, expect, it } from 'vitest'
import {
  formatChannelInterruptionReply,
  formatChannelToolInputUpdate,
  resolveChannelProgressLocale
} from './channel-progress-messages'

describe('channel progress messages', () => {
  it('formats tool input updates in English with a humanized tool label', () => {
    const message = formatChannelToolInputUpdate(
      {
        type: 'tool-input-available',
        toolCallId: 'tool-1',
        toolName: 'mastra_workspace_read_file',
        input: {
          path: 'README.md'
        }
      },
      'en-US'
    )

    expect(message).toBe('Using tool: Workspace Read File')
  })

  it('uses the web fetch display name override', () => {
    const message = formatChannelToolInputUpdate(
      {
        type: 'tool-input-available',
        toolCallId: 'tool-2',
        toolName: 'webFetch',
        input: {
          url: 'https://example.com'
        }
      },
      'en-US'
    )

    expect(message).toBe('Using tool: Web Fetch')
  })

  it('falls back to supported locales from raw locale tags', () => {
    expect(resolveChannelProgressLocale('fr')).toBe('fr-FR')
    expect(resolveChannelProgressLocale('zh-Hant-HK')).toBe('zh-HK')
    expect(resolveChannelProgressLocale('it-IT')).toBe('en-US')
  })

  it('formats interruption replies from supported locales', () => {
    expect(formatChannelInterruptionReply('queue', 'zh-Hans-CN')).toBe(
      '好的，我会在当前回复结束后立刻处理这条消息。'
    )
    expect(formatChannelInterruptionReply('interrupt', 'fr')).toBe(
      'Compris, je mets la réponse en cours en pause et je bascule maintenant.'
    )
  })
})

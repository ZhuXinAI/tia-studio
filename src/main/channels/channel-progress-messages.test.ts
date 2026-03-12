import { describe, expect, it } from 'vitest'
import {
  formatChannelInterruptionReply,
  formatChannelToolErrorUpdate,
  formatChannelToolInputUpdate,
  formatChannelToolOutputUpdate,
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

    expect(message).toBe('Using tool: Workspace Read File\nInput:\n{\n  "path": "README.md"\n}')
  })

  it('formats localized tool output and error updates', () => {
    const outputMessage = formatChannelToolOutputUpdate(
      {
        type: 'tool-output-available',
        toolCallId: 'tool-1',
        output: {
          ok: true
        }
      },
      {
        toolName: 'updateSoulMemory'
      },
      'zh-Hans-CN'
    )
    const errorMessage = formatChannelToolErrorUpdate(
      {
        type: 'tool-output-error',
        toolCallId: 'tool-1',
        errorText: 'File not found'
      },
      {
        toolName: 'updateSoulMemory'
      },
      'zh-Hans-CN'
    )

    expect(outputMessage).toBe('工具输出：Update Soul Memory\n输出:\n{\n  "ok": true\n}')
    expect(errorMessage).toBe('工具失败：Update Soul Memory\n错误:\nFile not found')
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

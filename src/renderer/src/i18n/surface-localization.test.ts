import { describe, expect, it } from 'vitest'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'
import zhHK from './locales/zh-HK.json'

function read(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, source)
}

describe('primary surface localization', () => {
  const primaryKeys = [
    'appShell.nav.newChat',
    'threads.sidebar.workspaces',
    'threads.composer.askPermission',
    'threads.page.noSelection',
    'threads.ui.reasoning',
    'skills.title',
    'skills.install',
    'automations.title',
    'automations.new',
    'automations.runNow'
  ]

  it('provides simplified and traditional Chinese copy for the primary app surfaces', () => {
    for (const key of primaryKeys) {
      expect(read(zhCN, key), `${key} in zh-CN`).toEqual(expect.any(String))
      expect(read(zhHK, key), `${key} in zh-HK`).toEqual(expect.any(String))
      expect(read(zhCN, key), `${key} should be translated in zh-CN`).not.toBe(read(enUS, key))
      expect(read(zhHK, key), `${key} should be translated in zh-HK`).not.toBe(read(enUS, key))
    }
  })
})

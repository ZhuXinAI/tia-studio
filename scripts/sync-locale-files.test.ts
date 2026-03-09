import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncLocaleFiles } from './sync-locale-files.mjs'

describe('syncLocaleFiles', () => {
  let tempDir: string
  let localesDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-locale-sync-'))
    localesDir = path.join(tempDir, 'locales')
    await mkdir(localesDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates missing locale files from en-US and backfills missing keys', async () => {
    await writeFile(
      path.join(localesDir, 'en-US.json'),
      JSON.stringify(
        {
          settings: {
            general: {
              title: 'General Settings',
              description: 'Manage language settings.'
            }
          }
        },
        null,
        2
      ),
      'utf8'
    )
    await writeFile(
      path.join(localesDir, 'zh-CN.json'),
      JSON.stringify(
        {
          settings: {
            general: {
              title: '常规设置'
            }
          }
        },
        null,
        2
      ),
      'utf8'
    )

    await syncLocaleFiles({
      localesDir,
      localeCodes: ['zh-CN', 'fr-FR']
    })

    const zhCN = JSON.parse(await readFile(path.join(localesDir, 'zh-CN.json'), 'utf8'))
    const frFR = JSON.parse(await readFile(path.join(localesDir, 'fr-FR.json'), 'utf8'))

    expect(zhCN).toEqual({
      settings: {
        general: {
          title: '常规设置',
          description: 'Manage language settings.'
        }
      }
    })
    expect(frFR).toEqual({
      settings: {
        general: {
          title: 'General Settings',
          description: 'Manage language settings.'
        }
      }
    })
  })
})

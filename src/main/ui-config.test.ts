import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UiConfigStore } from './ui-config'

describe('ui config store', () => {
  let tempDir: string
  let configPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-ui-config-'))
    configPath = path.join(tempDir, 'ui-config.json')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns an empty config when the file does not exist', () => {
    const store = new UiConfigStore({ filePath: configPath })

    expect(store.getConfig()).toEqual({})
  })

  it('normalizes transparent and language values from disk', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        transparent: true,
        language: 'fr-FR',
        ignored: 'value'
      }),
      'utf8'
    )

    const store = new UiConfigStore({ filePath: configPath })

    expect(store.getConfig()).toEqual({
      transparent: true,
      language: 'fr-FR'
    })
  })

  it('drops unsupported language overrides from disk', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        transparent: false,
        language: 'it-IT'
      }),
      'utf8'
    )

    const store = new UiConfigStore({ filePath: configPath })

    expect(store.getConfig()).toEqual({
      transparent: false
    })
  })

  it('merges updates without losing existing keys', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        transparent: true
      }),
      'utf8'
    )

    const store = new UiConfigStore({ filePath: configPath })
    const nextConfig = store.updateConfig({
      language: 'ja-JP'
    })
    const writtenValue = await readFile(configPath, 'utf8')

    expect(nextConfig).toEqual({
      transparent: true,
      language: 'ja-JP'
    })
    expect(JSON.parse(writtenValue)).toEqual({
      transparent: true,
      language: 'ja-JP'
    })
  })
})

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultLocaleCode = 'en-US'
const supportedLocaleCodes = [
  'zh-CN',
  'zh-HK',
  'en-US',
  'de-DE',
  'ja-JP',
  'ru-RU',
  'el-GR',
  'es-ES',
  'fr-FR',
  'pt-PT',
  'ro-RO'
]

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeLocaleValue(sourceValue, targetValue) {
  if (Array.isArray(sourceValue)) {
    return Array.isArray(targetValue) ? targetValue : sourceValue
  }

  if (!isPlainObject(sourceValue)) {
    return targetValue === undefined ? sourceValue : targetValue
  }

  const nextValue = {}
  const safeTarget = isPlainObject(targetValue) ? targetValue : {}

  for (const [key, childSourceValue] of Object.entries(sourceValue)) {
    nextValue[key] = mergeLocaleValue(childSourceValue, safeTarget[key])
  }

  return nextValue
}

async function readJsonFile(filePath) {
  const rawValue = await readFile(filePath, 'utf8')
  return JSON.parse(rawValue)
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function syncLocaleFiles(options = {}) {
  const localesDir =
    options.localesDir ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/i18n/locales')
  const sourceLocaleCode = options.sourceLocaleCode ?? defaultLocaleCode
  const localeCodes = options.localeCodes ?? supportedLocaleCodes.filter((code) => code !== sourceLocaleCode)
  const sourceFilePath = path.join(localesDir, `${sourceLocaleCode}.json`)
  const sourceCatalog = await readJsonFile(sourceFilePath)

  await mkdir(localesDir, { recursive: true })

  for (const localeCode of localeCodes) {
    const localeFilePath = path.join(localesDir, `${localeCode}.json`)
    let existingCatalog = {}

    try {
      existingCatalog = await readJsonFile(localeFilePath)
    } catch {
      existingCatalog = {}
    }

    const syncedCatalog = mergeLocaleValue(sourceCatalog, existingCatalog)
    await writeJsonFile(localeFilePath, syncedCatalog)
  }
}

const invokedPath = process.argv[1]
const currentFilePath = fileURLToPath(import.meta.url)

if (invokedPath && path.resolve(invokedPath) === currentFilePath) {
  await syncLocaleFiles()
}

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')

const argToBindings = {
  '--mac': ['@libsql/darwin-x64', '@libsql/darwin-arm64'],
  '--win': ['@libsql/win32-x64-msvc'],
  '--x64': ['@libsql/darwin-x64'],
  '--arm64': ['@libsql/darwin-arm64'],
  '--win-x64': ['@libsql/win32-x64-msvc']
}

const requestedBindings = new Set(process.argv.slice(2).flatMap((arg) => argToBindings[arg] ?? []))

if (requestedBindings.size === 0) {
  requestedBindings.add('@libsql/darwin-x64')
  requestedBindings.add('@libsql/darwin-arm64')
  requestedBindings.add('@libsql/win32-x64-msvc')
}

const missingBindings = [...requestedBindings].filter((bindingName) => {
  const bindingPath = resolve(projectRoot, 'node_modules', ...bindingName.split('/'))
  return !existsSync(bindingPath)
})

if (missingBindings.length > 0) {
  console.error(`Missing libsql native bindings: ${missingBindings.join(', ')}`)
  process.exit(1)
}

console.log(`Verified libsql native bindings: ${[...requestedBindings].join(', ')}`)

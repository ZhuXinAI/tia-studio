import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const electronBuilderBinary =
  process.platform === 'win32'
    ? resolve(projectRoot, 'node_modules', '.bin', 'electron-builder.cmd')
    : resolve(projectRoot, 'node_modules', '.bin', 'electron-builder')

const env = {
  ...process.env,
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
    'https://npmmirror.com/mirrors/electron-builder-binaries/'
}

delete env.npm_config_electron_mirror
delete env.NPM_CONFIG_ELECTRON_MIRROR
delete env.npm_package_config_electron_mirror
delete env.ELECTRON_MIRROR

const macTargetArgToBinding = {
  '--x64': '@libsql/darwin-x64',
  '--arm64': '@libsql/darwin-arm64'
}

const requestedMacBinding = process.argv
  .slice(2)
  .map((arg) => macTargetArgToBinding[arg])
  .find(Boolean)

if (process.argv.includes('--mac') && requestedMacBinding) {
  const bindingPath = resolve(projectRoot, 'node_modules', ...requestedMacBinding.split('/'))
  if (!existsSync(bindingPath)) {
    console.error(
      [
        `Missing required native dependency: ${requestedMacBinding}`,
        'Install dependencies with pnpm so both macOS libsql bindings are present before packaging.'
      ].join('\n')
    )
    process.exit(1)
  }
}

const requestedWindowsBinding =
  process.argv.includes('--win') && process.argv.includes('--x64')
    ? '@libsql/win32-x64-msvc'
    : undefined

if (requestedWindowsBinding) {
  const bindingPath = resolve(projectRoot, 'node_modules', ...requestedWindowsBinding.split('/'))
  if (!existsSync(bindingPath)) {
    console.error(
      [
        `Missing required native dependency: ${requestedWindowsBinding}`,
        'Install dependencies with pnpm so the Windows libsql binding is present before packaging.'
      ].join('\n')
    )
    process.exit(1)
  }
}

const child = spawn(electronBuilderBinary, process.argv.slice(2), {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

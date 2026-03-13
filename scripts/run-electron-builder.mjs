import { spawn } from 'node:child_process'
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

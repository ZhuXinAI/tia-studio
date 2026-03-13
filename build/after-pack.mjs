import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const unusedMacLibsqlBindingsByArch = {
  arm64: '@libsql/darwin-x64',
  x64: '@libsql/darwin-arm64'
}

const archNames = {
  1: 'x64',
  3: 'arm64'
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const archName =
    typeof context.arch === 'number'
      ? archNames[context.arch]
      : typeof context.arch === 'string'
        ? context.arch
        : undefined
  const unusedBinding = archName ? unusedMacLibsqlBindingsByArch[archName] : undefined
  if (!unusedBinding) {
    return
  }

  const appBundlePath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const bindingPath = join(
    appBundlePath,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    unusedBinding
  )

  await rm(bindingPath, { recursive: true, force: true })
}

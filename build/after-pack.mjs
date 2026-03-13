import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { Arch } from 'builder-util'

const unusedMacLibsqlBindings = {
  [Arch.arm64]: '@libsql/darwin-x64',
  [Arch.x64]: '@libsql/darwin-arm64'
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const unusedBinding = unusedMacLibsqlBindings[context.arch]
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

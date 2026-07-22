import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listWorkspaceFiles } from './workspace-file-search'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('listWorkspaceFiles', () => {
  it('lists workspace files without traversing generated or credential paths', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'tia-composer-files-'))
    temporaryDirectories.push(workspacePath)
    await mkdir(path.join(workspacePath, 'src', 'components'), { recursive: true })
    await mkdir(path.join(workspacePath, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(path.join(workspacePath, '.git'), { recursive: true })
    await Promise.all([
      writeFile(path.join(workspacePath, 'README.md'), '# TIA'),
      writeFile(path.join(workspacePath, 'src', 'components', 'composer.tsx'), 'export {}'),
      writeFile(path.join(workspacePath, '.env.local'), 'SECRET=value'),
      writeFile(path.join(workspacePath, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}'),
      writeFile(path.join(workspacePath, '.git', 'config'), '[core]')
    ])

    await expect(listWorkspaceFiles(workspacePath)).resolves.toEqual([
      { relativePath: 'README.md', name: 'README.md' },
      { relativePath: path.join('src', 'components', 'composer.tsx'), name: 'composer.tsx' }
    ])
  })
})

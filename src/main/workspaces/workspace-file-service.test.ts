import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { removeTestDirectory } from '../../test/remove-test-directory'
import { workspaceFileLimits } from '../../shared/workspace-files'
import { WorkspaceFileService } from './workspace-file-service'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => removeTestDirectory(directory)))
})

async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tia-workspace-files-'))
  directories.push(directory)
  return directory
}

describe('WorkspaceFileService', () => {
  it('lists one directory without recursively scanning hidden or generated paths', async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, 'src', 'nested'), { recursive: true })
    await mkdir(join(workspace, 'node_modules', 'package'), { recursive: true })
    await writeFile(join(workspace, 'README.md'), '# TIA')
    await writeFile(join(workspace, '.env.local'), 'secret')
    await writeFile(join(workspace, 'src', 'main.ts'), 'export {}')
    await writeFile(join(workspace, 'src', 'nested', 'deep.ts'), 'export {}')

    const service = new WorkspaceFileService()
    await expect(service.listDirectory(workspace)).resolves.toEqual({
      relativePath: '',
      truncated: false,
      entries: [
        { name: 'src', relativePath: 'src', kind: 'directory' },
        { name: 'README.md', relativePath: 'README.md', kind: 'file' }
      ]
    })
    await expect(service.listDirectory(workspace, 'src')).resolves.toEqual({
      relativePath: 'src',
      truncated: false,
      entries: [
        { name: 'nested', relativePath: 'src/nested', kind: 'directory' },
        { name: 'main.ts', relativePath: 'src/main.ts', kind: 'file' }
      ]
    })
  })

  it('caps a large directory response', async () => {
    const workspace = await createWorkspace()
    await Promise.all(
      Array.from({ length: workspaceFileLimits.maxDirectoryEntries + 1 }, (_, index) =>
        writeFile(join(workspace, `file-${String(index).padStart(4, '0')}.txt`), 'x')
      )
    )

    const result = await new WorkspaceFileService().listDirectory(workspace)
    expect(result.entries).toHaveLength(workspaceFileLimits.maxDirectoryEntries)
    expect(result.truncated).toBe(true)
  })

  it('reads text with a hash and rejects binary and oversized content', async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, 'notes.md'), 'hello')
    await writeFile(join(workspace, 'image.bin'), Buffer.from([0, 1, 2]))
    await writeFile(
      join(workspace, 'large.txt'),
      Buffer.alloc(workspaceFileLimits.maxTextFileBytes + 1, 65)
    )

    const service = new WorkspaceFileService()
    const content = await service.readFile(workspace, 'notes.md')
    expect(content).toMatchObject({
      name: 'notes.md',
      relativePath: 'notes.md',
      content: 'hello',
      sizeBytes: 5
    })
    expect(content.sha256).toMatch(/^[a-f0-9]{64}$/)
    await expect(service.readFile(workspace, 'image.bin')).rejects.toMatchObject({
      code: 'binary'
    })
    await expect(service.readFile(workspace, 'large.txt')).rejects.toMatchObject({
      code: 'too-large'
    })
  })

  it('writes only when the expected content hash still matches', async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, 'notes.md'), 'before')
    const service = new WorkspaceFileService()
    const current = await service.readFile(workspace, 'notes.md')

    const saved = await service.writeFile(workspace, 'notes.md', 'after', current.sha256)
    expect(saved.content).toBe('after')
    await expect(service.readFile(workspace, 'notes.md')).resolves.toMatchObject({
      content: 'after'
    })
    await expect(
      service.writeFile(workspace, 'notes.md', 'stale', current.sha256)
    ).rejects.toMatchObject({
      code: 'conflict'
    })
  })

  it('does not follow a symlink outside the workspace', async () => {
    const workspace = await createWorkspace()
    const outside = await mkdtemp(join(tmpdir(), 'tia-workspace-files-outside-'))
    directories.push(outside)
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(workspace, 'linked.txt'))

    await expect(
      new WorkspaceFileService().readFile(workspace, 'linked.txt')
    ).rejects.toMatchObject({
      code: 'unsafe-path'
    })
  })
})

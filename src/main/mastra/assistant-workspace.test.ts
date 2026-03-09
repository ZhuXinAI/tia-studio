import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureAssistantWorkspaceFiles, resolveAssistantWorkspacePath } from './assistant-workspace'

describe('assistant workspace', () => {
  let workspaceRoot: string | null = null

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = null
    }
  })

  it('creates identity, soul, memory, and heartbeat files', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-workspace-'))

    const createdFiles = await ensureAssistantWorkspaceFiles(workspaceRoot)

    expect(createdFiles).toEqual(
      expect.arrayContaining([
        path.join(workspaceRoot, 'IDENTITY.md'),
        path.join(workspaceRoot, 'SOUL.md'),
        path.join(workspaceRoot, 'MEMORY.md'),
        path.join(workspaceRoot, 'HEARTBEAT.md')
      ])
    )

    await expect(readFile(path.join(workspaceRoot, 'IDENTITY.md'), 'utf8')).resolves.toContain(
      '**Name:**'
    )
    await expect(readFile(path.join(workspaceRoot, 'SOUL.md'), 'utf8')).resolves.toContain(
      'Be genuinely helpful, not performatively helpful.'
    )
    await expect(readFile(path.join(workspaceRoot, 'MEMORY.md'), 'utf8')).resolves.toContain(
      'Curated long-term memory'
    )
    await expect(readFile(path.join(workspaceRoot, 'HEARTBEAT.md'), 'utf8')).resolves.toContain(
      'skip heartbeat'
    )
  })

  it('does not overwrite existing workspace files', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-workspace-'))
    const soulPath = path.join(workspaceRoot, 'SOUL.md')
    await writeFile(soulPath, '# SOUL.md\n\nKeep this.\n', 'utf8')

    await ensureAssistantWorkspaceFiles(workspaceRoot)

    await expect(readFile(soulPath, 'utf8')).resolves.toBe('# SOUL.md\n\nKeep this.\n')
  })

  it('resolves relative paths against the assistant workspace root', () => {
    const rootPath = '/tmp/assistant-workspace'

    expect(resolveAssistantWorkspacePath(rootPath, 'reports/daily.md')).toBe(
      path.resolve(rootPath, 'reports/daily.md')
    )
    expect(resolveAssistantWorkspacePath(rootPath, '/tmp/shared/report.md')).toBe(
      '/tmp/shared/report.md'
    )
  })
})

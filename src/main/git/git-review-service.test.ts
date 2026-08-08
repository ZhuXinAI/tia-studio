import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { removeTestDirectory } from '../../test/remove-test-directory'
import { GitReviewService } from './git-review-service'

const execFileAsync = promisify(execFile)
let directory: string | undefined

afterEach(async () => {
  if (directory) await removeTestDirectory(directory)
  directory = undefined
})

async function createRepository(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), 'tia-git-review-'))
  await execFileAsync('git', ['init', '-q', directory])
  await execFileAsync('git', ['-C', directory, 'config', 'user.email', 'test@example.com'])
  await execFileAsync('git', ['-C', directory, 'config', 'user.name', 'TIA Test'])
  await writeFile(join(directory, 'README.md'), 'before\n')
  await execFileAsync('git', ['-C', directory, 'add', '--', 'README.md'])
  await execFileAsync('git', ['-C', directory, 'commit', '-qm', 'initial'])
  return directory
}

describe('GitReviewService', () => {
  it('returns branch, changed files, and a unified diff', async () => {
    const root = await createRepository()
    await writeFile(join(root, 'README.md'), 'after\n')
    const review = await new GitReviewService().inspect(root)

    expect(review.isRepository).toBe(true)
    expect(review.branch).toBeTruthy()
    expect(review.changes).toEqual([
      expect.objectContaining({ path: 'README.md', kind: 'modified', worktree: true })
    ])
    expect(review.diff).toContain('-before')
    expect(review.diff).toContain('+after')
  })

  it('stages and unstages only selected workspace paths', async () => {
    const root = await createRepository()
    await writeFile(join(root, 'README.md'), 'after\n')
    const service = new GitReviewService()

    await service.stage(root, ['README.md'])
    expect((await service.inspect(root)).changes[0]).toMatchObject({ staged: true, worktree: false })
    await service.unstage(root, ['README.md'])
    expect((await service.inspect(root)).changes[0]).toMatchObject({ staged: false, worktree: true })
    await expect(service.stage(root, ['../outside.txt'])).rejects.toThrow('inside the workspace')
  })

  it('reports a non-repository workspace without throwing', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-git-review-'))
    await expect(new GitReviewService().inspect(directory)).resolves.toMatchObject({
      isRepository: false,
      changes: [],
      diff: ''
    })
  })
})

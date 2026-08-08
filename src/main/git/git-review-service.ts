import { execFile } from 'node:child_process'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { GitChange, GitChangeKind, GitReview } from '../../shared/git-review'

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 10_000
const MAX_DIFF_LENGTH = 512_000

function insideWorkspace(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate))
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
}

function kindForStatus(status: string): GitChangeKind {
  if (status === '??') return 'untracked'
  if (status.includes('R')) return 'renamed'
  if (status.includes('D')) return 'deleted'
  if (status.includes('A')) return 'added'
  if (status[0] && status[0] !== ' ') return 'staged'
  return 'modified'
}

function parseStatus(output: string): Pick<GitReview, 'branch' | 'ahead' | 'behind' | 'changes'> {
  const lines = output.split('\n').filter(Boolean)
  const header = lines.find((line) => line.startsWith('## '))?.slice(3) ?? ''
  const tracking = header.match(/^(.+?)(?:\.\.\.(?:[^ ]+))? \[ahead (\d+), behind (\d+)\]$/)
  const ahead = Number(tracking?.[2] ?? header.match(/\[ahead (\d+)\]/)?.[1] ?? 0)
  const behind = Number(tracking?.[3] ?? header.match(/\[behind (\d+)\]/)?.[1] ?? 0)
  const branch = (
    tracking?.[1] ??
    header.match(/^No commits yet on (.+)$/)?.[1] ??
    header.split('...')[0] ??
    header
  ).trim() || null
  const changes = lines
    .filter((line) => !line.startsWith('## '))
    .map((line): GitChange | null => {
      const status = line.slice(0, 2)
      const path = line.slice(3).trim()
      if (!path) return null
      return {
        path,
        status,
        kind: kindForStatus(status),
        staged: status[0] !== ' ' && status !== '??',
        worktree: status[1] !== ' ' && status !== '??'
      }
    })
    .filter((change): change is GitChange => Boolean(change))
  return { branch, ahead, behind, changes }
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_DIFF_LENGTH
  })
  return result.stdout
}

function isNonRepositoryError(error: unknown): boolean {
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code) : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === '128' || /not a git repository|outside repository/i.test(message)
}

export class GitReviewService {
  async inspect(workspacePath: string): Promise<GitReview> {
    try {
      const [status, unstaged, staged] = await Promise.all([
        git(['status', '--porcelain=v1', '-b'], workspacePath),
        git(['diff', '--no-ext-diff', '--unified=3'], workspacePath),
        git(['diff', '--cached', '--no-ext-diff', '--unified=3'], workspacePath)
      ])
      const parsed = parseStatus(status)
      const diff = [
        staged.trim() ? `### Staged changes\n${staged.trim()}` : '',
        unstaged.trim() ? `### Unstaged changes\n${unstaged.trim()}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, MAX_DIFF_LENGTH)
      return { isRepository: true, ...parsed, diff, checkedAt: new Date().toISOString() }
    } catch (error) {
      if (isNonRepositoryError(error)) {
        return {
          isRepository: false,
          branch: null,
          ahead: 0,
          behind: 0,
          changes: [],
          diff: '',
          checkedAt: new Date().toISOString()
        }
      }
      throw error
    }
  }

  async stage(workspacePath: string, paths: string[]): Promise<void> {
    await this.runPathOperation(workspacePath, 'add', paths)
  }

  async unstage(workspacePath: string, paths: string[]): Promise<void> {
    await this.runPathOperation(workspacePath, 'reset', paths)
  }

  private async runPathOperation(
    workspacePath: string,
    operation: 'add' | 'reset',
    paths: string[]
  ): Promise<void> {
    if (!paths.length) throw new Error('At least one repository path is required')
    const safePaths = paths.filter((path) => insideWorkspace(workspacePath, resolve(workspacePath, path)))
    if (safePaths.length !== paths.length) throw new Error('Git paths must stay inside the workspace')
    await git([operation, '--', ...safePaths], workspacePath)
  }
}

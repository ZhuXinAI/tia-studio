import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, opendir, realpath, rename, unlink } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  WorkspaceDirectory,
  WorkspaceFileContent,
  WorkspaceFileEntry
} from '../../shared/workspace-files'
import { workspaceFileLimits } from '../../shared/workspace-files'

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.idea',
  '.next',
  '.svn',
  '.turbo',
  '.vscode',
  '.venv',
  '.cache',
  '.artifacts',
  '.browser-profile',
  '.pnpm-store',
  '.serena',
  '.worktrees',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'releases',
  'target',
  'vendor'
])

function isSensitiveName(name: string): boolean {
  return (
    name === 'id_rsa' ||
    name === 'credentials' ||
    name === '.ssh' ||
    name.startsWith('.tia-studio-') ||
    name.startsWith('.env') ||
    name.endsWith('.key') ||
    name.endsWith('.pem')
  )
}

function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name) || isSensitiveName(name)
}

function isWithin(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath))
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  if (!normalized || normalized === '.') return ''
  if (normalized.includes('\0') || normalized.startsWith('/')) {
    throw new WorkspaceFileError('unsafe-path', 'The file path must stay inside the workspace')
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..' || part === '.')) {
    throw new WorkspaceFileError('unsafe-path', 'The file path must stay inside the workspace')
  }
  if (parts.some((part) => isIgnoredDirectory(part) || isSensitiveName(part))) {
    throw new WorkspaceFileError('forbidden', 'This workspace path is protected')
  }
  return parts.join(sep)
}

function relativePathFor(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(sep).join('/')
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export type WorkspaceFileErrorCode =
  | 'not-found'
  | 'not-directory'
  | 'not-file'
  | 'unsafe-path'
  | 'forbidden'
  | 'binary'
  | 'too-large'
  | 'conflict'

export class WorkspaceFileError extends Error {
  constructor(
    readonly code: WorkspaceFileErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'WorkspaceFileError'
  }
}

type ResolvedWorkspacePath = {
  absolutePath: string
  relativePath: string
}

export class WorkspaceFileService {
  async listDirectory(workspaceRootPath: string, requestedPath = ''): Promise<WorkspaceDirectory> {
    const resolved = await this.resolveExistingPath(workspaceRootPath, requestedPath)
    const stats = await lstat(resolved.absolutePath)
    if (!stats.isDirectory()) {
      throw new WorkspaceFileError(
        'not-directory',
        'The selected workspace path is not a directory'
      )
    }

    const entries: WorkspaceFileEntry[] = []
    let truncated = false
    const directory = await opendir(resolved.absolutePath)
    try {
      for await (const entry of directory) {
        if (
          entry.isSymbolicLink() ||
          isSensitiveName(entry.name) ||
          (entry.isDirectory() && isIgnoredDirectory(entry.name))
        ) {
          continue
        }
        if (!entry.isDirectory() && !entry.isFile()) continue

        entries.push({
          name: entry.name,
          relativePath: resolved.relativePath
            ? `${resolved.relativePath}/${entry.name}`
            : entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file'
        })

        if (entries.length > workspaceFileLimits.maxDirectoryEntries) {
          truncated = true
          break
        }
      }
    } finally {
      await directory.close().catch(() => undefined)
    }

    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })

    return {
      relativePath: resolved.relativePath,
      entries: truncated ? entries.slice(0, workspaceFileLimits.maxDirectoryEntries) : entries,
      truncated
    }
  }

  async readFile(workspaceRootPath: string, requestedPath: string): Promise<WorkspaceFileContent> {
    const resolved = await this.resolveExistingPath(workspaceRootPath, requestedPath)
    const stats = await lstat(resolved.absolutePath)
    if (!stats.isFile()) {
      throw new WorkspaceFileError('not-file', 'The selected workspace path is not a file')
    }
    const buffer = await this.readTextBuffer(resolved.absolutePath, stats.size)
    return {
      name: resolved.absolutePath.split(sep).pop() ?? resolved.relativePath,
      relativePath: resolved.relativePath,
      content: buffer.toString('utf8'),
      sha256: sha256(buffer),
      sizeBytes: buffer.byteLength
    }
  }

  async writeFile(
    workspaceRootPath: string,
    requestedPath: string,
    content: string,
    expectedSha256: string
  ): Promise<WorkspaceFileContent> {
    const current = await this.readFile(workspaceRootPath, requestedPath)
    if (current.sha256 !== expectedSha256) {
      throw new WorkspaceFileError(
        'conflict',
        'The file changed on disk. Reload it before saving your edits.'
      )
    }

    const buffer = Buffer.from(content, 'utf8')
    if (buffer.byteLength > workspaceFileLimits.maxTextFileBytes) {
      throw new WorkspaceFileError('too-large', 'The edited file is too large to save here')
    }

    const absolutePath = await this.resolveExistingPath(workspaceRootPath, requestedPath)
    const stats = await lstat(absolutePath.absolutePath)
    if (!stats.isFile()) {
      throw new WorkspaceFileError('not-file', 'The selected workspace path is not a file')
    }

    const temporaryPath = `${absolutePath.absolutePath}.tia-studio-${randomUUID()}.tmp`
    try {
      const temporary = await open(temporaryPath, 'wx', stats.mode & 0o777)
      try {
        await temporary.writeFile(buffer)
        await temporary.sync()
      } finally {
        await temporary.close()
      }
      try {
        await rename(temporaryPath, absolutePath.absolutePath)
      } catch (error) {
        // Windows does not replace an existing file with rename(). The target was
        // revalidated above; remove only that exact file before the fallback rename.
        const errorCode = (error as NodeJS.ErrnoException).code
        if (process.platform !== 'win32' || (errorCode !== 'EEXIST' && errorCode !== 'EPERM')) {
          throw error
        }
        await unlink(absolutePath.absolutePath)
        await rename(temporaryPath, absolutePath.absolutePath)
      }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }

    return {
      name: absolutePath.absolutePath.split(sep).pop() ?? absolutePath.relativePath,
      relativePath: absolutePath.relativePath,
      content,
      sha256: sha256(buffer),
      sizeBytes: buffer.byteLength
    }
  }

  private async resolveExistingPath(
    workspaceRootPath: string,
    requestedPath: string
  ): Promise<ResolvedWorkspacePath> {
    const normalizedPath = normalizeRelativePath(requestedPath)
    let rootPath: string
    try {
      rootPath = await realpath(workspaceRootPath)
    } catch {
      throw new WorkspaceFileError('not-found', 'The workspace directory is unavailable')
    }

    const lexicalPath = resolve(rootPath, normalizedPath)
    if (!isWithin(rootPath, lexicalPath)) {
      throw new WorkspaceFileError('unsafe-path', 'The file path must stay inside the workspace')
    }

    let absolutePath: string
    try {
      absolutePath = await realpath(lexicalPath)
    } catch {
      throw new WorkspaceFileError('not-found', 'The workspace path was not found')
    }
    if (!isWithin(rootPath, absolutePath)) {
      throw new WorkspaceFileError('unsafe-path', 'The file path must stay inside the workspace')
    }

    return {
      absolutePath,
      relativePath: relativePathFor(rootPath, absolutePath)
    }
  }

  private async readTextBuffer(absolutePath: string, fileSize: number): Promise<Buffer> {
    if (fileSize > workspaceFileLimits.maxTextFileBytes) {
      throw new WorkspaceFileError('too-large', 'This file is too large to preview here')
    }
    const handle = await open(absolutePath, 'r')
    try {
      const currentStats = await handle.stat()
      if (currentStats.size > workspaceFileLimits.maxTextFileBytes) {
        throw new WorkspaceFileError('too-large', 'This file is too large to preview here')
      }
      const buffer = Buffer.alloc(workspaceFileLimits.maxTextFileBytes + 1)
      const readResult = await handle.read(buffer, 0, buffer.byteLength, 0)
      const content = buffer.subarray(0, readResult.bytesRead)
      if (content.includes(0)) {
        throw new WorkspaceFileError(
          'binary',
          'Binary files are not previewed in the workspace rail'
        )
      }
      if (readResult.bytesRead > workspaceFileLimits.maxTextFileBytes) {
        throw new WorkspaceFileError('too-large', 'This file is too large to preview here')
      }
      return content
    } finally {
      await handle.close()
    }
  }
}

import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import type { ComposerMentionFile } from '../../shared/composer-mentions'

const MAX_DEPTH = 5
const MAX_FILES = 300

// This intentionally does not parse .gitignore. A small, explicit exclusion list keeps the
// composer responsive without reading repository configuration or generated dependency trees.
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor'
])

const isSensitiveFile = (name: string): boolean =>
  name === 'id_rsa' ||
  name === 'credentials' ||
  name.startsWith('.env') ||
  name.endsWith('.key') ||
  name.endsWith('.pem')

export async function listWorkspaceFiles(workspacePath: string): Promise<ComposerMentionFile[]> {
  const files: ComposerMentionFile[] = []
  const queue: Array<{ absolutePath: string; relativePath: string; depth: number }> = [
    { absolutePath: path.resolve(workspacePath), relativePath: '', depth: 0 }
  ]

  while (queue.length > 0 && files.length < MAX_FILES) {
    const directory = queue.shift()
    if (!directory) continue

    let entries: Dirent<string>[]
    try {
      entries = await readdir(directory.absolutePath, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      continue
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= MAX_FILES) break
      if (entry.isSymbolicLink()) continue

      const relativePath = directory.relativePath
        ? path.join(directory.relativePath, entry.name)
        : entry.name

      if (entry.isDirectory()) {
        if (directory.depth < MAX_DEPTH && !IGNORED_DIRECTORIES.has(entry.name)) {
          queue.push({
            absolutePath: path.join(directory.absolutePath, entry.name),
            relativePath,
            depth: directory.depth + 1
          })
        }
        continue
      }

      if (entry.isFile() && !isSensitiveFile(entry.name)) {
        files.push({ relativePath, name: entry.name })
      }
    }
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

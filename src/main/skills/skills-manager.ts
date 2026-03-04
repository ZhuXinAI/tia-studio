import os from 'node:os'
import path from 'node:path'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'

type SkillSource = 'global-claude' | 'global-agent' | 'workspace'

type SkillSourceDefinition = {
  source: SkillSource
  rootPath: string
  canDelete: boolean
}

type WalkDirectory = {
  absolutePath: string
  relativePath: string
}

export type AssistantSkillRecord = {
  id: string
  name: string
  description: string | null
  source: SkillSource
  sourceRootPath: string
  directoryPath: string
  relativePath: string
  skillFilePath: string
  canDelete: boolean
}

const skillSourceOrder: Record<SkillSource, number> = {
  'global-claude': 0,
  'global-agent': 1,
  workspace: 2
}

function parseFrontmatter(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return {}
  }

  const metadata: Record<string, string> = {}
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '---') {
      break
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex < 0) {
      continue
    }

    const rawKey = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    if (!rawKey || !rawValue) {
      continue
    }

    let value = rawValue
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    metadata[rawKey] = value
  }

  return metadata
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function toSkillSources(workspaceRootPath: string): SkillSourceDefinition[] {
  const workspacePath = path.resolve(workspaceRootPath)
  return [
    {
      source: 'global-claude',
      rootPath: path.join(os.homedir(), '.claude', 'skills'),
      canDelete: false
    },
    {
      source: 'global-agent',
      rootPath: path.join(os.homedir(), '.agent', 'skills'),
      canDelete: false
    },
    {
      source: 'workspace',
      rootPath: path.join(workspacePath, 'skills'),
      canDelete: true
    }
  ]
}

function isFileMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return (error as { code?: unknown }).code === 'ENOENT'
}

async function collectSkillDirectories(rootPath: string): Promise<WalkDirectory[]> {
  const queue: WalkDirectory[] = [{ absolutePath: rootPath, relativePath: '' }]
  const skillDirectories: WalkDirectory[] = []

  while (queue.length > 0) {
    const currentDirectory = queue.shift()
    if (!currentDirectory) {
      continue
    }

    let entries: Dirent[]
    try {
      entries = await readdir(currentDirectory.absolutePath, { withFileTypes: true })
    } catch (error) {
      if (isFileMissingError(error)) {
        continue
      }

      throw error
    }

    const hasSkillFile = entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')
    if (hasSkillFile) {
      skillDirectories.push(currentDirectory)
    }

    const nextDirectories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const relativePath =
          currentDirectory.relativePath.length > 0
            ? path.join(currentDirectory.relativePath, entry.name)
            : entry.name

        return {
          absolutePath: path.join(currentDirectory.absolutePath, entry.name),
          relativePath
        }
      })
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))

    queue.push(...nextDirectories)
  }

  return skillDirectories
}

async function readSkillMetadata(skillFilePath: string): Promise<{
  name: string | null
  description: string | null
}> {
  const rawSkillContent = await readFile(skillFilePath, 'utf8')
  const frontmatter = parseFrontmatter(rawSkillContent)

  return {
    name: toNonEmptyString(frontmatter.name),
    description: toNonEmptyString(frontmatter.description)
  }
}

export async function listAssistantSkills(workspaceRootPath: string): Promise<AssistantSkillRecord[]> {
  const normalizedWorkspaceRoot = toNonEmptyString(workspaceRootPath)
  if (!normalizedWorkspaceRoot) {
    return []
  }

  const skills: AssistantSkillRecord[] = []
  const skillSources = toSkillSources(normalizedWorkspaceRoot)

  for (const source of skillSources) {
    const directories = await collectSkillDirectories(source.rootPath)
    for (const directory of directories) {
      const skillFilePath = path.join(directory.absolutePath, 'SKILL.md')

      let metadata: Awaited<ReturnType<typeof readSkillMetadata>>
      try {
        metadata = await readSkillMetadata(skillFilePath)
      } catch (error) {
        if (isFileMissingError(error)) {
          continue
        }

        throw error
      }

      const relativePath =
        directory.relativePath.length > 0 ? directory.relativePath : path.basename(source.rootPath)

      skills.push({
        id: `${source.source}:${relativePath}`,
        name: metadata.name ?? path.basename(directory.absolutePath),
        description: metadata.description,
        source: source.source,
        sourceRootPath: source.rootPath,
        directoryPath: directory.absolutePath,
        relativePath,
        skillFilePath,
        canDelete: source.canDelete
      })
    }
  }

  return skills.sort((left, right) => {
    const sourceOrder = skillSourceOrder[left.source] - skillSourceOrder[right.source]
    if (sourceOrder !== 0) {
      return sourceOrder
    }

    return left.relativePath.localeCompare(right.relativePath)
  })
}

function isInsideDirectory(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  if (relative.length === 0) {
    return false
  }

  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

export async function removeWorkspaceSkill(
  workspaceRootPath: string,
  relativeSkillPath: string
): Promise<void> {
  const workspacePath = toNonEmptyString(workspaceRootPath)
  const skillPath = toNonEmptyString(relativeSkillPath)
  if (!workspacePath || !skillPath) {
    throw new Error('Workspace root path and relative skill path are required')
  }

  if (path.isAbsolute(skillPath)) {
    throw new Error('Workspace skill path must be relative')
  }

  const workspaceSkillsRoot = path.resolve(path.join(workspacePath, 'skills'))
  const targetSkillPath = path.resolve(path.join(workspaceSkillsRoot, skillPath))
  if (!isInsideDirectory(targetSkillPath, workspaceSkillsRoot)) {
    throw new Error('Workspace skill path must stay inside workspace skills directory')
  }

  let targetStats: Awaited<ReturnType<typeof stat>>
  try {
    targetStats = await stat(targetSkillPath)
  } catch (error) {
    if (isFileMissingError(error)) {
      throw new Error('Workspace skill folder not found')
    }

    throw error
  }

  if (!targetStats.isDirectory()) {
    throw new Error('Workspace skill path must point to a skill folder')
  }

  const skillFilePath = path.join(targetSkillPath, 'SKILL.md')
  try {
    const skillFileStats = await stat(skillFilePath)
    if (!skillFileStats.isFile()) {
      throw new Error('Workspace skill folder is missing SKILL.md')
    }
  } catch (error) {
    if (isFileMissingError(error)) {
      throw new Error('Workspace skill folder is missing SKILL.md')
    }

    throw error
  }

  await rm(targetSkillPath, { recursive: true, force: false })
}

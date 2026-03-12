import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { readdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { promisify } from 'node:util'

type SkillSource = 'global-claude' | 'global-agent' | 'workspace'
export type RecommendedSkillId = 'agent-browser' | 'find-skills'

type SkillSourceDefinition = {
  source: SkillSource
  rootPath: string
  canDelete: boolean
}

type WalkDirectory = {
  absolutePath: string
  relativePath: string
}

type ResolvedDirectoryEntry = {
  entry: Dirent
  isDirectory: boolean
  isFile: boolean
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

type RecommendedSkillDefinition = {
  id: RecommendedSkillId
  repositoryUrl: string
  skillName: string
}

type RunInstallCommandOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

type RunInstallCommand = (
  command: string,
  args: string[],
  options: RunInstallCommandOptions
) => Promise<void>

const execFileAsync = promisify(execFile)
const recommendedSkillDefinitions: RecommendedSkillDefinition[] = [
  {
    id: 'agent-browser',
    repositoryUrl: 'https://github.com/vercel-labs/agent-browser',
    skillName: 'agent-browser'
  },
  {
    id: 'find-skills',
    repositoryUrl: 'https://github.com/vercel-labs/skills',
    skillName: 'find-skills'
  }
]

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
  const traversedRealPaths = new Set<string>()

  while (queue.length > 0) {
    const currentDirectory = queue.shift()
    if (!currentDirectory) {
      continue
    }

    let currentRealPath: string
    try {
      currentRealPath = await realpath(currentDirectory.absolutePath)
    } catch (error) {
      if (isFileMissingError(error)) {
        continue
      }

      throw error
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

    const resolvedEntries = await Promise.all(
      entries.map((entry) => resolveEntryType(currentDirectory.absolutePath, entry))
    )

    const hasSkillFile = resolvedEntries.some(
      (resolvedEntry) => resolvedEntry.isFile && resolvedEntry.entry.name === 'SKILL.md'
    )
    if (hasSkillFile) {
      skillDirectories.push(currentDirectory)
    }

    if (traversedRealPaths.has(currentRealPath)) {
      continue
    }

    traversedRealPaths.add(currentRealPath)

    const nextDirectories = resolvedEntries
      .filter((resolvedEntry) => resolvedEntry.isDirectory)
      .map((resolvedEntry) => {
        const relativePath =
          currentDirectory.relativePath.length > 0
            ? path.join(currentDirectory.relativePath, resolvedEntry.entry.name)
            : resolvedEntry.entry.name

        return {
          absolutePath: path.join(currentDirectory.absolutePath, resolvedEntry.entry.name),
          relativePath
        }
      })
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))

    queue.push(...nextDirectories)
  }

  return skillDirectories
}

async function resolveEntryType(
  parentDirectoryPath: string,
  entry: Dirent
): Promise<ResolvedDirectoryEntry> {
  if (entry.isDirectory()) {
    return {
      entry,
      isDirectory: true,
      isFile: false
    }
  }

  if (entry.isFile()) {
    return {
      entry,
      isDirectory: false,
      isFile: true
    }
  }

  if (!entry.isSymbolicLink()) {
    return {
      entry,
      isDirectory: false,
      isFile: false
    }
  }

  try {
    const targetStats = await stat(path.join(parentDirectoryPath, entry.name))
    return {
      entry,
      isDirectory: targetStats.isDirectory(),
      isFile: targetStats.isFile()
    }
  } catch (error) {
    if (isFileMissingError(error)) {
      return {
        entry,
        isDirectory: false,
        isFile: false
      }
    }

    throw error
  }
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

export async function listAssistantSkills(
  workspaceRootPath: string
): Promise<AssistantSkillRecord[]> {
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

function resolveRecommendedSkillDefinition(
  skillId: RecommendedSkillId
): RecommendedSkillDefinition {
  const definition = recommendedSkillDefinitions.find((candidate) => candidate.id === skillId)
  if (!definition) {
    throw new Error(`Unsupported recommended skill id: ${skillId}`)
  }

  return definition
}

export async function installRecommendedSkillsWithBunx(input: {
  bunxPath: string
  skillIds: RecommendedSkillId[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  runCommand?: RunInstallCommand
}): Promise<RecommendedSkillId[]> {
  const bunxPath = toNonEmptyString(input.bunxPath)
  if (!bunxPath) {
    throw new Error('bunx path is required')
  }

  const skillIds = Array.from(new Set(input.skillIds))
  if (skillIds.length === 0) {
    return []
  }

  const runCommand =
    input.runCommand ??
    (async (command, args, options) => {
      await execFileAsync(command, args, {
        cwd: options.cwd,
        env: options.env,
        encoding: 'utf8'
      })
    })
  const cwd = input.cwd ?? os.homedir()

  for (const skillId of skillIds) {
    const definition = resolveRecommendedSkillDefinition(skillId)
    await runCommand(
      bunxPath,
      [
        'skills',
        'add',
        definition.repositoryUrl,
        '--skill',
        definition.skillName,
        '--global',
        '--agent',
        'claude-code',
        '--yes'
      ],
      {
        cwd,
        env: input.env
      }
    )
  }

  return skillIds
}

function normalizeSkillKey(value: string): string {
  return value.trim().toLowerCase()
}

export async function getInstalledRecommendedSkills(): Promise<RecommendedSkillId[]> {
  const skills = await listAssistantSkills(os.homedir())
  const globalClaudeSkills = skills.filter((skill) => skill.source === 'global-claude')
  const normalizedNames = new Set(
    globalClaudeSkills.flatMap((skill) => [
      normalizeSkillKey(skill.name),
      normalizeSkillKey(path.basename(skill.relativePath))
    ])
  )

  return recommendedSkillDefinitions
    .filter((definition) => normalizedNames.has(normalizeSkillKey(definition.skillName)))
    .map((definition) => definition.id)
}

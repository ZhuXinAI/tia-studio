import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { promisify } from 'node:util'
import type {
  DesktopSkillCatalogPage,
  DesktopSkillCatalogQuery,
  DesktopSkillRecord,
  DesktopSkillSource,
  DesktopSkillSourceCounts
} from '../../shared/desktop-discovery'
import type { SkillMarketplaceRecord } from '../../shared/skill-marketplace'

type SkillSource = DesktopSkillSource
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

export type SkillRecord = DesktopSkillRecord
export type SkillCatalogPage = DesktopSkillCatalogPage

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
const topSkillDefinitions = [
  ['find-skills', 'Find Skills', 'vercel-labs/skills', 2559128],
  ['frontend-design', 'Frontend Design', 'anthropics/skills', 677536],
  ['grill-me', 'Grill Me', 'mattpocock/skills', 589016],
  ['vercel-react-best-practices', 'React Best Practices', 'vercel-labs/agent-skills', 560599],
  ['agent-browser', 'Agent Browser', 'vercel-labs/agent-browser', 556072],
  ['grill-with-docs', 'Grill with Docs', 'mattpocock/skills', 498165],
  ['improve-codebase-architecture', 'Improve Codebase Architecture', 'mattpocock/skills', 486099],
  ['web-design-guidelines', 'Web Design Guidelines', 'vercel-labs/agent-skills', 472135],
  ['tdd', 'Test-Driven Development', 'mattpocock/skills', 466614],
  ['microsoft-foundry', 'Microsoft Foundry', 'microsoft/azure-skills', 463543],
  ['azure-ai', 'Azure AI', 'microsoft/azure-skills', 460067],
  ['azure-deploy', 'Azure Deploy', 'microsoft/azure-skills', 459766],
  ['azure-diagnostics', 'Azure Diagnostics', 'microsoft/azure-skills', 459616],
  ['azure-prepare', 'Azure Prepare', 'microsoft/azure-skills', 459460],
  ['azure-storage', 'Azure Storage', 'microsoft/azure-skills', 459148],
  ['azure-validate', 'Azure Validate', 'microsoft/azure-skills', 458815],
  ['entra-app-registration', 'Entra App Registration', 'microsoft/azure-skills', 458700],
  ['appinsights-instrumentation', 'App Insights Instrumentation', 'microsoft/azure-skills', 458620],
  ['azure-compliance', 'Azure Compliance', 'microsoft/azure-skills', 458541],
  ['azure-resource-lookup', 'Azure Resource Lookup', 'microsoft/azure-skills', 458534]
] as const
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
  'global-codex': 0,
  'global-claude': 1,
  'global-agent': 2,
  'global-agent-legacy': 3,
  workspace: 4
}

const defaultSkillCatalogPageLimit = 24
const maxSkillCatalogPageLimit = 100

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

function createEmptySkillSourceCounts(): DesktopSkillSourceCounts {
  return {
    'global-codex': 0,
    'global-claude': 0,
    'global-agent': 0,
    'global-agent-legacy': 0,
    workspace: 0
  }
}

function normalizeSkillCatalogLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit) || !limit || limit < 1) {
    return defaultSkillCatalogPageLimit
  }

  return Math.min(limit, maxSkillCatalogPageLimit)
}

function normalizeSkillCatalogCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0
  }

  const parsed = Number(cursor)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0
  }

  return parsed
}

function matchesSkillSearch(skill: SkillRecord, normalizedSearch: string): boolean {
  if (normalizedSearch.length === 0) {
    return true
  }

  return [skill.name, skill.description ?? '', skill.relativePath, skill.sourceRootPath].some(
    (value) => value.toLowerCase().includes(normalizedSearch)
  )
}

function toSkillSources(input: {
  workspaceRootPath?: string | null
  includeWorkspaceSource: boolean
}): SkillSourceDefinition[] {
  const sources: SkillSourceDefinition[] = [
    {
      source: 'global-codex',
      rootPath: path.join(os.homedir(), '.codex', 'skills'),
      canDelete: false
    },
    {
      source: 'global-claude',
      rootPath: path.join(os.homedir(), '.claude', 'skills'),
      canDelete: false
    },
    {
      source: 'global-agent',
      rootPath: path.join(os.homedir(), '.agents', 'skills'),
      canDelete: false
    },
    {
      source: 'global-agent-legacy',
      rootPath: path.join(os.homedir(), '.agent', 'skills'),
      canDelete: false
    }
  ]

  const normalizedWorkspaceRoot = toNonEmptyString(input.workspaceRootPath)
  if (!input.includeWorkspaceSource || !normalizedWorkspaceRoot) {
    return sources
  }

  return [
    ...sources,
    {
      source: 'workspace',
      rootPath: path.join(path.resolve(normalizedWorkspaceRoot), 'skills'),
      canDelete: true
    }
  ]
}

export async function listDiscoveredSkills(input?: {
  workspaceRootPath?: string | null
  includeWorkspaceSource?: boolean
}): Promise<SkillRecord[]> {
  const includeWorkspaceSource = input?.includeWorkspaceSource !== false
  const skills: SkillRecord[] = []
  const skillSources = toSkillSources({
    workspaceRootPath: input?.workspaceRootPath,
    includeWorkspaceSource
  })

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

export async function listDiscoveredSkillsPage(
  input?: {
    workspaceRootPath?: string | null
    includeWorkspaceSource?: boolean
  } & DesktopSkillCatalogQuery
): Promise<SkillCatalogPage> {
  const skills = await listDiscoveredSkills({
    workspaceRootPath: input?.workspaceRootPath,
    includeWorkspaceSource: input?.includeWorkspaceSource
  })
  const normalizedSearch = input?.search?.trim().toLowerCase() ?? ''
  const sourceCounts = createEmptySkillSourceCounts()
  const searchMatchedSkills = skills.filter((skill) => {
    const matchesSearch = matchesSkillSearch(skill, normalizedSearch)
    if (matchesSearch) {
      sourceCounts[skill.source] += 1
    }
    return matchesSearch
  })
  const sourceMatchedSkills = input?.source
    ? searchMatchedSkills.filter((skill) => skill.source === input.source)
    : searchMatchedSkills
  const offset = normalizeSkillCatalogCursor(input?.cursor)
  const limit = normalizeSkillCatalogLimit(input?.limit)
  const pagedSkills = sourceMatchedSkills.slice(offset, offset + limit)
  const nextOffset = offset + pagedSkills.length

  return {
    skills: pagedSkills,
    totalCount: sourceMatchedSkills.length,
    sourceCounts,
    nextCursor: nextOffset < sourceMatchedSkills.length ? String(nextOffset) : null
  }
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

export async function listSkills(workspaceRootPath: string): Promise<SkillRecord[]> {
  if (!toNonEmptyString(workspaceRootPath)) {
    return []
  }

  return listDiscoveredSkills({
    workspaceRootPath,
    includeWorkspaceSource: true
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
  bunxArgs?: string[]
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
  const bunxArgs = Array.isArray(input.bunxArgs) ? [...input.bunxArgs] : []

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
        ...bunxArgs,
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
  const skills = await listDiscoveredSkills({
    includeWorkspaceSource: false
  })
  const normalizedNames = new Set(
    skills.flatMap((skill) => [
      normalizeSkillKey(skill.name),
      normalizeSkillKey(path.basename(skill.relativePath))
    ])
  )

  return recommendedSkillDefinitions
    .filter((definition) => normalizedNames.has(normalizeSkillKey(definition.skillName)))
    .map((definition) => definition.id)
}

async function hasInstalledSkill(rootPath: string | null, slug: string): Promise<boolean> {
  if (!rootPath) return false
  try {
    return (await stat(path.join(rootPath, slug, 'SKILL.md'))).isFile()
  } catch (error) {
    if (isFileMissingError(error)) return false
    throw error
  }
}

export async function listSkillMarketplace(input: {
  globalSkillsRoot: string
}): Promise<SkillMarketplaceRecord[]> {
  return Promise.all(
    topSkillDefinitions.map(async ([slug, name, source, installs], index) => ({
      id: `${source}/${slug}`,
      rank: index + 1,
      slug,
      name,
      source,
      installs,
      installedGlobal: await hasInstalledSkill(input.globalSkillsRoot, slug)
    }))
  )
}

export async function installMarketplaceSkill(input: {
  skillId: string
  globalSkillsRoot: string
}): Promise<void> {
  const definition = topSkillDefinitions.find(
    ([slug, , source]) => `${source}/${slug}` === input.skillId
  )
  if (!definition) throw new Error('Skill is not in the TIA catalog')
  const [slug, , source] = definition
  const targetRoot = input.globalSkillsRoot
  if (await hasInstalledSkill(targetRoot, slug)) return
  await mkdir(targetRoot, { recursive: true })

  const cloneRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-skill-install-'))
  const checkout = path.join(cloneRoot, 'source')
  const staging = path.join(targetRoot, `.${slug}-${randomUUID()}`)
  const target = path.join(targetRoot, slug)
  const backup = path.join(targetRoot, `.${slug}-backup-${randomUUID()}`)
  try {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', `https://github.com/${source}.git`, checkout],
      {
        encoding: 'utf8'
      }
    )
    const candidates = await collectSkillDirectories(checkout)
    let sourceDirectory: string | null = null
    for (const candidate of candidates) {
      const metadata = await readSkillMetadata(path.join(candidate.absolutePath, 'SKILL.md'))
      if (metadata.name === slug || path.basename(candidate.absolutePath) === slug) {
        sourceDirectory = candidate.absolutePath
        break
      }
    }
    if (!sourceDirectory) throw new Error(`Skill bundle ${slug} was not found in ${source}`)
    await cp(sourceDirectory, staging, { recursive: true, errorOnExist: true })
    let hadExisting = false
    try {
      await rename(target, backup)
      hadExisting = true
    } catch (error) {
      if (!isFileMissingError(error)) throw error
    }
    try {
      await rename(staging, target)
      if (hadExisting) await rm(backup, { recursive: true, force: true })
    } catch (error) {
      if (hadExisting) await rename(backup, target).catch(() => undefined)
      throw error
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(cloneRoot, { recursive: true, force: true })
  }
}

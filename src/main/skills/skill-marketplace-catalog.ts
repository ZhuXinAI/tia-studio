import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type MarketplaceSkillDefinition = {
  slug: string
  name: string
  source: string
  installs: number
}

type SkillsShSkill = {
  source: string
  skillId: string
  name: string
  installs: number
}

type SkillsShPageResponse = {
  skills: SkillsShSkill[]
}

type CachedTopSkills = {
  checkedAt: string
  fetchedAt?: string
  skills: MarketplaceSkillDefinition[]
}

export type GetTopSkillMarketplaceDefinitionsInput = {
  cachePath: string
  fetchImplementation?: typeof fetch
  now?: () => number
}

export const skillMarketplaceCacheMaxAgeMs = 24 * 60 * 60 * 1000
export const skillMarketplaceCacheSkillLimit = 200

const skillsShAllTimePageUrl = 'https://skills.sh/api/skills/all-time/0'
const skillsShFetchTimeoutMs = 10_000
const githubPathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const fallbackTopSkillDefinitions: readonly MarketplaceSkillDefinition[] = [
  { slug: 'find-skills', name: 'Find Skills', source: 'vercel-labs/skills', installs: 2559128 },
  {
    slug: 'frontend-design',
    name: 'Frontend Design',
    source: 'anthropics/skills',
    installs: 677536
  },
  { slug: 'grill-me', name: 'Grill Me', source: 'mattpocock/skills', installs: 589016 },
  {
    slug: 'vercel-react-best-practices',
    name: 'React Best Practices',
    source: 'vercel-labs/agent-skills',
    installs: 560599
  },
  {
    slug: 'agent-browser',
    name: 'Agent Browser',
    source: 'vercel-labs/agent-browser',
    installs: 556072
  },
  {
    slug: 'grill-with-docs',
    name: 'Grill with Docs',
    source: 'mattpocock/skills',
    installs: 498165
  },
  {
    slug: 'improve-codebase-architecture',
    name: 'Improve Codebase Architecture',
    source: 'mattpocock/skills',
    installs: 486099
  },
  {
    slug: 'web-design-guidelines',
    name: 'Web Design Guidelines',
    source: 'vercel-labs/agent-skills',
    installs: 472135
  },
  {
    slug: 'tdd',
    name: 'Test-Driven Development',
    source: 'mattpocock/skills',
    installs: 466614
  },
  {
    slug: 'microsoft-foundry',
    name: 'Microsoft Foundry',
    source: 'microsoft/azure-skills',
    installs: 463543
  },
  { slug: 'azure-ai', name: 'Azure AI', source: 'microsoft/azure-skills', installs: 460067 },
  {
    slug: 'azure-deploy',
    name: 'Azure Deploy',
    source: 'microsoft/azure-skills',
    installs: 459766
  },
  {
    slug: 'azure-diagnostics',
    name: 'Azure Diagnostics',
    source: 'microsoft/azure-skills',
    installs: 459616
  },
  {
    slug: 'azure-prepare',
    name: 'Azure Prepare',
    source: 'microsoft/azure-skills',
    installs: 459460
  },
  {
    slug: 'azure-storage',
    name: 'Azure Storage',
    source: 'microsoft/azure-skills',
    installs: 459148
  },
  {
    slug: 'azure-validate',
    name: 'Azure Validate',
    source: 'microsoft/azure-skills',
    installs: 458815
  },
  {
    slug: 'entra-app-registration',
    name: 'Entra App Registration',
    source: 'microsoft/azure-skills',
    installs: 458700
  },
  {
    slug: 'appinsights-instrumentation',
    name: 'App Insights Instrumentation',
    source: 'microsoft/azure-skills',
    installs: 458620
  },
  {
    slug: 'azure-compliance',
    name: 'Azure Compliance',
    source: 'microsoft/azure-skills',
    installs: 458541
  },
  {
    slug: 'azure-resource-lookup',
    name: 'Azure Resource Lookup',
    source: 'microsoft/azure-skills',
    installs: 458534
  }
]

const pendingRefreshes = new Map<string, Promise<MarketplaceSkillDefinition[]>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isGithubPathSegment(value: string): boolean {
  return githubPathSegmentPattern.test(value) && value !== '.' && value !== '..'
}

function isValidSource(value: string): boolean {
  const [owner, repository, ...remaining] = value.split('/')
  return (
    remaining.length === 0 &&
    typeof owner === 'string' &&
    typeof repository === 'string' &&
    isGithubPathSegment(owner) &&
    isGithubPathSegment(repository)
  )
}

function formatDisplayName(name: string): string {
  return name
    .trim()
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function toMarketplaceSkillDefinition(
  value: unknown,
  formatName: boolean
): MarketplaceSkillDefinition | null {
  if (!isRecord(value)) return null
  const source = typeof value.source === 'string' ? value.source.trim() : ''
  const rawSlug = typeof value.skillId === 'string' ? value.skillId : value.slug
  const slug = typeof rawSlug === 'string' ? rawSlug.trim() : ''
  const rawName = typeof value.name === 'string' ? value.name.trim() : ''
  const installs = typeof value.installs === 'number' ? value.installs : Number.NaN

  if (
    !isValidSource(source) ||
    !isGithubPathSegment(slug) ||
    rawName.length === 0 ||
    !Number.isFinite(installs) ||
    installs < 0
  ) {
    return null
  }

  return {
    source,
    slug,
    name: formatName ? formatDisplayName(rawName) : rawName,
    installs: Math.floor(installs)
  }
}

function toDefinitions(value: unknown, formatName = true): MarketplaceSkillDefinition[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const definitions: MarketplaceSkillDefinition[] = []
  const ids = new Set<string>()
  for (const item of value) {
    const definition = toMarketplaceSkillDefinition(item, formatName)
    if (!definition) return null
    const id = `${definition.source}/${definition.slug}`
    if (ids.has(id)) return null
    ids.add(id)
    definitions.push(definition)
    if (definitions.length === skillMarketplaceCacheSkillLimit) break
  }

  return definitions.length > 0 ? definitions : null
}

function toCachedTopSkills(value: unknown): CachedTopSkills | null {
  if (!isRecord(value)) return null
  const checkedAt = typeof value.checkedAt === 'string' ? value.checkedAt : value.fetchedAt
  if (typeof checkedAt !== 'string' || !Number.isFinite(Date.parse(checkedAt))) return null
  const fetchedAt = typeof value.fetchedAt === 'string' ? value.fetchedAt : undefined
  if (fetchedAt && !Number.isFinite(Date.parse(fetchedAt))) return null
  const skills = toDefinitions(value.skills, false)
  return skills ? { checkedAt, fetchedAt, skills } : null
}

function isFresh(cache: CachedTopSkills, now: number): boolean {
  const age = now - Date.parse(cache.checkedAt)
  return age >= 0 && age < skillMarketplaceCacheMaxAgeMs
}

async function readTopSkillsCache(cachePath: string): Promise<CachedTopSkills | null> {
  try {
    return toCachedTopSkills(JSON.parse(await readFile(cachePath, 'utf8')))
  } catch {
    return null
  }
}

async function writeTopSkillsCache(input: {
  cachePath: string
  checkedAt: string
  fetchedAt?: string
  skills: MarketplaceSkillDefinition[]
}): Promise<void> {
  const directory = path.dirname(input.cachePath)
  const temporaryPath = path.join(
    directory,
    `.${path.basename(input.cachePath)}-${randomUUID()}.tmp`
  )
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(
      temporaryPath,
      JSON.stringify({
        checkedAt: input.checkedAt,
        ...(input.fetchedAt ? { fetchedAt: input.fetchedAt } : {}),
        skills: input.skills
      }),
      'utf8'
    )
    await rename(temporaryPath, input.cachePath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function fetchTopSkills(
  fetchImplementation: typeof fetch
): Promise<MarketplaceSkillDefinition[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), skillsShFetchTimeoutMs)
  try {
    const response = await fetchImplementation(skillsShAllTimePageUrl, {
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`skills.sh returned ${response.status}`)
    }
    const responseData = (await response.json()) as unknown
    if (!isRecord(responseData)) {
      throw new Error('skills.sh returned an invalid response')
    }
    const skills = toDefinitions((responseData as SkillsShPageResponse).skills)
    if (!skills) {
      throw new Error('skills.sh returned no valid skills')
    }
    return skills
  } finally {
    clearTimeout(timeout)
  }
}

function fallbackDefinitions(): MarketplaceSkillDefinition[] {
  return fallbackTopSkillDefinitions.map((definition) => ({ ...definition }))
}

export async function getTopSkillMarketplaceDefinitions(
  input: GetTopSkillMarketplaceDefinitionsInput
): Promise<MarketplaceSkillDefinition[]> {
  const now = input.now?.() ?? Date.now()
  const cached = await readTopSkillsCache(input.cachePath)
  if (cached && isFresh(cached, now)) {
    return cached.skills
  }

  const pendingRefresh = pendingRefreshes.get(input.cachePath)
  if (pendingRefresh) {
    try {
      return await pendingRefresh
    } catch {
      return cached?.skills ?? fallbackDefinitions()
    }
  }

  const refresh = fetchTopSkills(input.fetchImplementation ?? fetch)
  pendingRefreshes.set(input.cachePath, refresh)
  try {
    const skills = await refresh
    const checkedAt = new Date(now).toISOString()
    try {
      await writeTopSkillsCache({
        cachePath: input.cachePath,
        checkedAt,
        fetchedAt: checkedAt,
        skills
      })
    } catch {
      // A temporary local-storage failure must not hide a successful catalog response.
    }
    return skills
  } catch {
    const skills = cached?.skills ?? fallbackDefinitions()
    try {
      await writeTopSkillsCache({
        cachePath: input.cachePath,
        checkedAt: new Date(now).toISOString(),
        fetchedAt: cached?.fetchedAt,
        skills
      })
    } catch {
      // A temporary local-storage failure cannot prevent the fallback catalog from loading.
    }
    return skills
  } finally {
    if (pendingRefreshes.get(input.cachePath) === refresh) {
      pendingRefreshes.delete(input.cachePath)
    }
  }
}

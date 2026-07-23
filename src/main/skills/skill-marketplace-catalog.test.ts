import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fallbackTopSkillDefinitions,
  getTopSkillMarketplaceDefinitions,
  skillMarketplaceCacheMaxAgeMs
} from './skill-marketplace-catalog'

const firstFetchedAt = Date.UTC(2026, 6, 23, 0, 0, 0)

function skillsResponse(
  skills: Array<{ source: string; skillId: string; name: string; installs: number }>
): Response {
  return new Response(JSON.stringify({ skills, total: skills.length, hasMore: false, page: 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const fetchedSkills = [
  {
    source: 'example-org/skill-library',
    skillId: 'design-review',
    name: 'design-review',
    installs: 42
  },
  {
    source: 'example-org/skill-library',
    skillId: 'api-audit',
    name: 'api-audit',
    installs: 21
  }
]

describe('skill marketplace catalog', () => {
  let tempRoot: string
  let cachePath: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-skills-catalog-'))
    cachePath = path.join(tempRoot, 'skills-marketplace-top.json')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('fetches the first all-time page and persists its top skills', async () => {
    const fetchImplementation = vi.fn(async () => skillsResponse(fetchedSkills))

    const skills = await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation,
      now: () => firstFetchedAt
    })

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://skills.sh/api/skills/all-time/0',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(skills).toEqual([
      {
        source: 'example-org/skill-library',
        slug: 'design-review',
        name: 'Design Review',
        installs: 42
      },
      {
        source: 'example-org/skill-library',
        slug: 'api-audit',
        name: 'Api Audit',
        installs: 21
      }
    ])
    await expect(readFile(cachePath, 'utf8')).resolves.toContain(
      '"fetchedAt":"2026-07-23T00:00:00.000Z"'
    )
  })

  it('uses a fresh disk cache without requesting skills.sh again', async () => {
    await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation: vi.fn(async () => skillsResponse(fetchedSkills)),
      now: () => firstFetchedAt
    })
    const fetchImplementation = vi.fn(async () => skillsResponse([]))

    const skills = await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation,
      now: () => firstFetchedAt + skillMarketplaceCacheMaxAgeMs - 1
    })

    expect(fetchImplementation).not.toHaveBeenCalled()
    expect(skills[0]).toMatchObject({ slug: 'design-review', installs: 42 })
  })

  it('refreshes a cache once it reaches 24 hours', async () => {
    await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation: vi.fn(async () => skillsResponse(fetchedSkills)),
      now: () => firstFetchedAt
    })
    const refreshedSkills = [
      {
        source: 'example-org/skill-library',
        skillId: 'new-top-skill',
        name: 'new-top-skill',
        installs: 999
      }
    ]
    const fetchImplementation = vi.fn(async () => skillsResponse(refreshedSkills))

    const skills = await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation,
      now: () => firstFetchedAt + skillMarketplaceCacheMaxAgeMs
    })

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(skills).toEqual([
      {
        source: 'example-org/skill-library',
        slug: 'new-top-skill',
        name: 'New Top Skill',
        installs: 999
      }
    ])
  })

  it('uses the stale cache, then the static list, when skills.sh is unavailable', async () => {
    await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation: vi.fn(async () => skillsResponse(fetchedSkills)),
      now: () => firstFetchedAt
    })
    const unavailable = vi.fn(async () => new Response('', { status: 503 }))

    const staleSkills = await getTopSkillMarketplaceDefinitions({
      cachePath,
      fetchImplementation: unavailable,
      now: () => firstFetchedAt + skillMarketplaceCacheMaxAgeMs
    })
    const fallbackCachePath = path.join(tempRoot, 'missing-cache.json')
    const fallbackSkills = await getTopSkillMarketplaceDefinitions({
      cachePath: fallbackCachePath,
      fetchImplementation: unavailable,
      now: () => firstFetchedAt
    })
    const cachedFallbackSkills = await getTopSkillMarketplaceDefinitions({
      cachePath: fallbackCachePath,
      fetchImplementation: unavailable,
      now: () => firstFetchedAt + 1
    })

    expect(staleSkills[0]).toMatchObject({ slug: 'design-review', installs: 42 })
    expect(fallbackSkills).toEqual(fallbackTopSkillDefinitions)
    expect(cachedFallbackSkills).toEqual(fallbackTopSkillDefinitions)
    expect(unavailable).toHaveBeenCalledTimes(2)
  })
})

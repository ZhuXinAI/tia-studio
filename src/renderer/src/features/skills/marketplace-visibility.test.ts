import { describe, expect, it } from 'vitest'
import type { SkillMarketplaceRecord } from '../../../../shared/skill-marketplace'
import { getVisibleMarketplaceSkills, initialMarketplaceSkillCount } from './marketplace-visibility'

function skill(index: number): SkillMarketplaceRecord {
  return {
    id: `example-org/skills/skill-${index}`,
    rank: index,
    slug: `skill-${index}`,
    name: `Skill ${index}`,
    source: 'example-org/skills',
    installs: 1000 - index,
    installedGlobal: false
  }
}

describe('getVisibleMarketplaceSkills', () => {
  const skills = Array.from({ length: 25 }, (_, index) => skill(index + 1))

  it('shows only the top 20 skills before a search begins', () => {
    const visibleSkills = getVisibleMarketplaceSkills(skills, '')

    expect(visibleSkills).toHaveLength(initialMarketplaceSkillCount)
    expect(visibleSkills.at(-1)?.slug).toBe('skill-20')
  })

  it('searches the complete cached page instead of only the initial 20', () => {
    const visibleSkills = getVisibleMarketplaceSkills(skills, 'skill')

    expect(visibleSkills).toHaveLength(25)
    expect(visibleSkills.at(-1)?.slug).toBe('skill-25')
  })
})

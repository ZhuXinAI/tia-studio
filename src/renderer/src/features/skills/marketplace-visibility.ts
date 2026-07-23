import type { SkillMarketplaceRecord } from '../../../../shared/skill-marketplace'

export const initialMarketplaceSkillCount = 20

export function getVisibleMarketplaceSkills(
  skills: SkillMarketplaceRecord[],
  query: string
): SkillMarketplaceRecord[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return skills.slice(0, initialMarketplaceSkillCount)
  }

  return skills.filter((skill) =>
    `${skill.name} ${skill.slug} ${skill.source}`.toLowerCase().includes(normalizedQuery)
  )
}

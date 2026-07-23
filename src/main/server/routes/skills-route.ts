import type { Hono } from 'hono'
import type { SkillMarketplaceRecord } from '../../../shared/skill-marketplace'

type RegisterSkillsRouteOptions = {
  listTopSkills: () => Promise<SkillMarketplaceRecord[]>
}

export function registerSkillsRoute(app: Hono, options: RegisterSkillsRouteOptions): void {
  app.get('/api/skills/top', async (context) => {
    const skills = await options.listTopSkills()
    return context.json({ skills, total: skills.length })
  })
}

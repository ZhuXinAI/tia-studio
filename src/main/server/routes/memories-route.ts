import type { Hono } from 'hono'
import { z } from 'zod'
import type { MemoriesRepository } from '../../persistence/repos/memories-repo'

const saveMemorySchema = z.object({
  workspaceId: z.string().trim().min(1).nullable(),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(50_000),
  enabled: z.boolean()
})

async function body(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

export function registerMemoriesRoute(
  app: Hono,
  options: { memoriesRepo: MemoriesRepository }
): void {
  app.get('/v1/memories', async (context) => {
    const workspaceId = context.req.query('workspaceId')
    return context.json(
      await options.memoriesRepo.list(
        workspaceId === undefined ? undefined : workspaceId.trim() || null
      )
    )
  })

  app.post('/v1/memories', async (context) => {
    const parsed = saveMemorySchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    return context.json(await options.memoriesRepo.create(parsed.data), 201)
  })

  app.put('/v1/memories/:memoryId', async (context) => {
    const parsed = saveMemorySchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    const updated = await options.memoriesRepo.update(context.req.param('memoryId'), parsed.data)
    return updated ? context.json(updated) : context.json({ error: 'Memory not found' }, 404)
  })

  app.delete('/v1/memories/:memoryId', async (context) => {
    const deleted = await options.memoriesRepo.delete(context.req.param('memoryId'))
    return deleted ? context.body(null, 204) : context.json({ error: 'Memory not found' }, 404)
  })
}

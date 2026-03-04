import type { Hono } from 'hono'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { createAssistantSchema, updateAssistantSchema } from '../validators/assistants-validator'

type RegisterAssistantsRouteOptions = {
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
}

function jsonBodyError() {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerAssistantsRoute(
  app: Hono,
  options: RegisterAssistantsRouteOptions
): void {
  app.get('/v1/assistants', async (context) => {
    const assistants = await options.assistantsRepo.list()
    return context.json(assistants)
  })

  app.post('/v1/assistants', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(jsonBodyError(), 400)
    }

    const parsed = createAssistantSchema.safeParse(body)
    if (!parsed.success) {
      return context.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }, 400)
    }

    const provider = await options.providersRepo.getById(parsed.data.providerId)
    if (!provider) {
      return context.json({ ok: false, error: 'Provider not found' }, 400)
    }

    const assistant = await options.assistantsRepo.create(parsed.data)
    return context.json(assistant, 201)
  })

  app.patch('/v1/assistants/:assistantId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(jsonBodyError(), 400)
    }

    const parsed = updateAssistantSchema.safeParse(body)
    if (!parsed.success) {
      return context.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }, 400)
    }

    if (parsed.data.providerId) {
      const provider = await options.providersRepo.getById(parsed.data.providerId)
      if (!provider) {
        return context.json({ ok: false, error: 'Provider not found' }, 400)
      }
    }

    const assistant = await options.assistantsRepo.update(
      context.req.param('assistantId'),
      parsed.data
    )
    if (!assistant) {
      return context.json({ ok: false, error: 'Assistant not found' }, 404)
    }

    return context.json(assistant)
  })

  app.delete('/v1/assistants/:assistantId', async (context) => {
    const assistantId = context.req.param('assistantId')
    const assistant = await options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      return context.json({ ok: false, error: 'Assistant not found' }, 404)
    }

    if (assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true) {
      return context.json({ ok: false, error: 'Built-in default assistant cannot be deleted' }, 409)
    }

    const deleted = await options.assistantsRepo.delete(assistantId)
    if (!deleted) {
      return context.json({ ok: false, error: 'Assistant not found' }, 404)
    }

    return context.body(null, 204)
  })
}

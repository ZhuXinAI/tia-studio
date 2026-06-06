import type { Hono } from 'hono'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'

type RegisterAssistantsRouteOptions = {
  assistantsRepo: AssistantsRepository
}

export function registerAssistantsRoute(app: Hono, options: RegisterAssistantsRouteOptions): void {
  app.get('/v1/assistants', async (context) => {
    const assistants = await options.assistantsRepo.list()
    return context.json(assistants)
  })
}

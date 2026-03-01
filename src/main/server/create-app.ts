import { Hono } from 'hono'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import { createBearerAuthMiddleware } from './auth-middleware'
import { registerAssistantsRoute } from './routes/assistants-route'
import { registerHealthRoute } from './routes/health-route'
import { registerProvidersRoute } from './routes/providers-route'
import { registerThreadsRoute } from './routes/threads-route'

type CreateAppOptions = {
  token: string
  repositories?: {
    providers: ProvidersRepository
    assistants: AssistantsRepository
    threads: ThreadsRepository
  }
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono()

  app.use('/v1/*', createBearerAuthMiddleware(options.token))
  registerHealthRoute(app)

  if (options.repositories) {
    registerProvidersRoute(app, {
      providersRepo: options.repositories.providers
    })
    registerAssistantsRoute(app, {
      assistantsRepo: options.repositories.assistants,
      providersRepo: options.repositories.providers
    })
    registerThreadsRoute(app, {
      threadsRepo: options.repositories.threads,
      assistantsRepo: options.repositories.assistants
    })
  }

  return app
}

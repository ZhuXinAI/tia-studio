import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import { createBearerAuthMiddleware } from './auth-middleware'
import { registerAssistantsRoute } from './routes/assistants-route'
import { registerChatRoute } from './routes/chat-route'
import { registerHealthRoute } from './routes/health-route'
import { registerMcpServersRoute } from './routes/mcp-servers-route'
import { registerProvidersRoute } from './routes/providers-route'
import { registerThreadsRoute } from './routes/threads-route'
import { registerWebSearchSettingsRoute } from './routes/web-search-settings-route'

type CreateAppOptions = {
  token: string
  repositories?: {
    providers: ProvidersRepository
    assistants: AssistantsRepository
    threads: ThreadsRepository
    webSearchSettings: WebSearchSettingsRepository
    mcpServers: McpServersRepository
  }
  assistantRuntime?: AssistantRuntime
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono()

  app.use(
    '/v1/*',
    cors({
      origin: (origin) => origin ?? '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type']
    })
  )
  app.use('/v1/*', createBearerAuthMiddleware(options.token))
  app.use(
    '/chat/*',
    cors({
      origin: (origin) => origin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type']
    })
  )
  app.use('/chat/*', createBearerAuthMiddleware(options.token))
  registerHealthRoute(app)

  if (options.repositories) {
    registerProvidersRoute(app, {
      providersRepo: options.repositories.providers,
      assistantsRepo: options.repositories.assistants
    })
    registerAssistantsRoute(app, {
      assistantsRepo: options.repositories.assistants,
      providersRepo: options.repositories.providers
    })
    registerThreadsRoute(app, {
      threadsRepo: options.repositories.threads,
      assistantsRepo: options.repositories.assistants
    })
    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: options.repositories.webSearchSettings
    })
    registerMcpServersRoute(app, {
      mcpServersRepo: options.repositories.mcpServers
    })
  }

  if (options.assistantRuntime) {
    registerChatRoute(app, {
      assistantRuntime: options.assistantRuntime
    })
  }

  return app
}

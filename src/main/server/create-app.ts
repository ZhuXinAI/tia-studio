import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ChannelsRepository } from '../persistence/repos/channels-repo'
import type { ChannelPairingsRepository } from '../persistence/repos/channel-pairings-repo'
import type { CronJobsRepository } from '../persistence/repos/cron-jobs-repo'
import type { McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { TeamThreadsRepository } from '../persistence/repos/team-threads-repo'
import type { TeamWorkspacesRepository } from '../persistence/repos/team-workspaces-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import type { TeamRuntime } from '../mastra/team-runtime'
import { createBearerAuthMiddleware } from './auth-middleware'
import type { ThreadMessageEventsStore } from './chat/thread-message-events-store'
import type { TeamRunStatusStore } from './chat/team-run-status-store'
import { registerAssistantsRoute } from './routes/assistants-route'
import { registerChatRoute } from './routes/chat-route'
import { registerClawsRoute } from './routes/claws-route'
import { registerCronJobsRoute } from './routes/cron-jobs-route'
import { registerHealthRoute } from './routes/health-route'
import { registerMcpServersRoute } from './routes/mcp-servers-route'
import { registerProvidersRoute } from './routes/providers-route'
import { registerTeamChatRoute } from './routes/team-chat-route'
import { registerTeamThreadsRoute } from './routes/team-threads-route'
import { registerTeamWorkspacesRoute } from './routes/team-workspaces-route'
import { registerThreadsRoute } from './routes/threads-route'
import { registerWebSearchSettingsRoute } from './routes/web-search-settings-route'

type CreateAppOptions = {
  token: string
  repositories?: {
    providers: ProvidersRepository
    assistants: AssistantsRepository
    threads: ThreadsRepository
    teamWorkspaces: TeamWorkspacesRepository
    teamThreads: TeamThreadsRepository
    webSearchSettings: WebSearchSettingsRepository
    mcpServers: McpServersRepository
    channels: ChannelsRepository
    pairings: ChannelPairingsRepository
    cronJobs: CronJobsRepository
  }
  assistantRuntime?: AssistantRuntime
  teamRuntime?: TeamRuntime
  teamRunStatusStore?: TeamRunStatusStore
  threadMessageEventsStore?: ThreadMessageEventsStore
  channelService?: {
    reload(): Promise<void>
  }
  cronSchedulerService?: {
    reload(): Promise<void>
  }
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
  app.use(
    '/team-chat/*',
    cors({
      origin: (origin) => origin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type']
    })
  )
  app.use('/team-chat/*', createBearerAuthMiddleware(options.token))
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
    if (options.channelService) {
      registerClawsRoute(app, {
        assistantsRepo: options.repositories.assistants,
        providersRepo: options.repositories.providers,
        channelsRepo: options.repositories.channels,
        pairingsRepo: options.repositories.pairings,
        channelService: options.channelService,
        cronSchedulerService: options.cronSchedulerService
      })
    }
    registerThreadsRoute(app, {
      threadsRepo: options.repositories.threads,
      assistantsRepo: options.repositories.assistants
    })
    registerTeamWorkspacesRoute(app, {
      teamWorkspacesRepo: options.repositories.teamWorkspaces
    })
    registerTeamThreadsRoute(app, {
      teamThreadsRepo: options.repositories.teamThreads,
      teamWorkspacesRepo: options.repositories.teamWorkspaces,
      providersRepo: options.repositories.providers
    })
    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: options.repositories.webSearchSettings
    })
    registerMcpServersRoute(app, {
      mcpServersRepo: options.repositories.mcpServers
    })
    if (options.cronSchedulerService) {
      registerCronJobsRoute(app, {
        cronJobsRepo: options.repositories.cronJobs,
        assistantsRepo: options.repositories.assistants,
        threadsRepo: options.repositories.threads,
        cronSchedulerService: options.cronSchedulerService
      })
    }
  }

  if (options.assistantRuntime) {
    registerChatRoute(app, {
      assistantRuntime: options.assistantRuntime,
      threadMessageEventsStore: options.threadMessageEventsStore
    })
  }

  if (options.teamRuntime && options.teamRunStatusStore) {
    registerTeamChatRoute(app, {
      teamRuntime: options.teamRuntime,
      teamRunStatusStore: options.teamRunStatusStore
    })
  }

  return app
}

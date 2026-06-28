import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ChannelsRepository } from '../persistence/repos/channels-repo'
import type { ChannelPairingsRepository } from '../persistence/repos/channel-pairings-repo'
import type { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import type { McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { SecuritySettingsRepository } from '../persistence/repos/security-settings-repo'
import type { ThreadUsageRepository } from '../persistence/repos/thread-usage-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import type { WorkspacesRepository } from '../persistence/repos/workspaces-repo'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import type { WhatsAppAuthStateStore } from '../channels/whatsapp-auth-state-store'
import type { WechatAuthStateStore } from '../channels/wechat-auth-state-store'
import { createBearerAuthMiddlewareWithOptions } from './auth-middleware'
import type { ThreadMessageEventsStore } from './chat/thread-message-events-store'
import { registerAssistantsRoute } from './routes/assistants-route'
import { registerChannelsRoute } from './routes/channels-route'
import { registerChatRoute } from './routes/chat-route'
import { registerDesktopRoute } from './routes/desktop-route'
import { registerHealthRoute } from './routes/health-route'
import { registerMcpServersRoute } from './routes/mcp-servers-route'
import { registerMigrationRoute } from './routes/migration-route'
import { registerProvidersRoute } from './routes/providers-route'
import { registerSecuritySettingsRoute } from './routes/security-settings-route'
import { registerThreadsRoute } from './routes/threads-route'
import { registerWebSearchSettingsRoute } from './routes/web-search-settings-route'
import { registerWorkspacesRoute } from './routes/workspaces-route'
import type { DesktopBootstrap } from '../../shared/desktop-bootstrap'
import type { UiConfig } from '../ui-config'
import type { AutoUpdateState } from '../auto-updater'
import type { ManagedRuntimeKind, ManagedRuntimesState } from '../persistence/repos/managed-runtimes-repo'
import type { RecommendedSkillId } from '../skills/skills-manager'

type CreateAppOptions = {
  token: string
  annotationMode?: {
    enabled: boolean
    allowedOrigins: string[]
  }
  desktop?: {
    getDesktopBootstrap: () => DesktopBootstrap
    getUiConfig: () => UiConfig
    setUiConfig: (config: UiConfig) => UiConfig
    getSystemLocale: () => string
    getAutoUpdateState: () => AutoUpdateState
    setAutoUpdateEnabled: (enabled: boolean) => Promise<AutoUpdateState>
    checkForUpdates: () => Promise<AutoUpdateState>
    restartToUpdate: () => void
    getManagedRuntimeStatus: () => Promise<ManagedRuntimesState>
    checkManagedRuntimeLatest: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
    installManagedRuntime: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
    pickCustomRuntime: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState | null>
    clearManagedRuntime: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
    getRuntimeOnboardingSkillsStatus: () => Promise<RecommendedSkillId[]>
    installRuntimeOnboardingSkills: (skillIds: RecommendedSkillId[]) => Promise<RecommendedSkillId[]>
    pickDirectory: () => Promise<string | null>
  }
  repositories?: {
    providers: ProvidersRepository
    assistants: AssistantsRepository
    threads: ThreadsRepository
    workspaces?: WorkspacesRepository
    webSearchSettings: WebSearchSettingsRepository
    securitySettings?: SecuritySettingsRepository
    mcpServers: McpServersRepository
    threadUsage: ThreadUsageRepository
    channels: ChannelsRepository
    pairings: ChannelPairingsRepository
    channelThreadBindings: ChannelThreadBindingsRepository
  }
  assistantRuntime?: AssistantRuntime
  threadMessageEventsStore?: ThreadMessageEventsStore
  channelService?: {
    reload(): Promise<void>
  }
  channelSetupRecovery?: {
    recover(channel: { id: string; type: string }): Promise<void>
  }
  getManagedRuntimeStatus?: () => Promise<
    Partial<
      Record<
        'codex-acp' | 'claude-agent-acp',
        {
          status: string
          binaryPath: string | null
          errorMessage: string | null
        }
      >
    >
  >
  whatsAppAuthStateStore?: WhatsAppAuthStateStore
  wechatAuthStateStore?: WechatAuthStateStore
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono()
  const allowUnauthenticatedOrigins = options.annotationMode?.enabled
    ? options.annotationMode.allowedOrigins
    : []

  app.use(
    '/v1/*',
    cors({
      origin: (origin) => origin ?? '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type']
    })
  )
  app.use(
    '/v1/*',
    createBearerAuthMiddlewareWithOptions(options.token, {
      allowUnauthenticatedOrigins
    })
  )
  app.use(
    '/chat',
    cors({
      origin: (origin) => origin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type']
    })
  )
  app.use(
    '/chat/*',
    cors({
      origin: (origin) => origin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type']
    })
  )
  app.use(
    '/chat',
    createBearerAuthMiddlewareWithOptions(options.token, {
      allowUnauthenticatedOrigins
    })
  )
  app.use(
    '/chat/*',
    createBearerAuthMiddlewareWithOptions(options.token, {
      allowUnauthenticatedOrigins
    })
  )
  registerHealthRoute(app)

  if (options.desktop) {
    registerDesktopRoute(app, options.desktop)
  }

  if (options.repositories) {
    registerProvidersRoute(app, {
      providersRepo: options.repositories.providers,
      assistantsRepo: options.repositories.assistants,
      getManagedRuntimeStatus: options.getManagedRuntimeStatus
    })
    registerAssistantsRoute(app, {
      assistantsRepo: options.repositories.assistants
    })
    registerThreadsRoute(app, {
      threadsRepo: options.repositories.threads,
      assistantsRepo: options.repositories.assistants,
      providersRepo: options.repositories.providers,
      workspacesRepo: options.repositories.workspaces,
      channelThreadBindingsRepo: options.repositories.channelThreadBindings,
      threadUsageRepo: options.repositories.threadUsage
    })
    registerChannelsRoute(app, {
      assistantsRepo: options.repositories.assistants,
      channelsRepo: options.repositories.channels,
      pairingsRepo: options.repositories.pairings,
      channelService: options.channelService ?? {
        reload: async () => undefined
      },
      channelSetupRecovery: options.channelSetupRecovery,
      whatsAppAuthStateStore: options.whatsAppAuthStateStore,
      wechatAuthStateStore: options.wechatAuthStateStore
    })
    registerMigrationRoute(app, {
      assistantsRepo: options.repositories.assistants,
      channelsRepo: options.repositories.channels,
      channelService: options.channelService ?? {
        reload: async () => undefined
      }
    })
    if (options.repositories.workspaces) {
      registerWorkspacesRoute(app, {
        workspacesRepo: options.repositories.workspaces
      })
    }
    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: options.repositories.webSearchSettings
    })
    if (options.repositories.securitySettings) {
      registerSecuritySettingsRoute(app, {
        securitySettingsRepo: options.repositories.securitySettings,
        providersRepo: options.repositories.providers
      })
    }
    registerMcpServersRoute(app, {
      mcpServersRepo: options.repositories.mcpServers
    })
  }

  if (options.assistantRuntime) {
    registerChatRoute(app, {
      assistantRuntime: options.assistantRuntime,
      threadMessageEventsStore: options.threadMessageEventsStore,
      threadsRepo: options.repositories?.threads
    })
  }

  return app
}

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ChannelsRepository } from '../persistence/repos/channels-repo'
import type { ChannelPairingsRepository } from '../persistence/repos/channel-pairings-repo'
import type { McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import type { McpServerHealthRegistry } from '../agents/pi/mcp-server-health'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { PermissionRulesRepository } from '../persistence/repos/permission-rules-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import type { WorkspacesRepository } from '../persistence/repos/workspaces-repo'
import type { WhatsAppAuthStateStore } from '../channels/whatsapp-auth-state-store'
import type { WechatAuthStateStore } from '../channels/wechat-auth-state-store'
import { createBearerAuthMiddlewareWithOptions } from './auth-middleware'
import { registerChannelsRoute } from './routes/channels-route'
import { registerDesktopRoute } from './routes/desktop-route'
import { registerHealthRoute } from './routes/health-route'
import { registerMcpServersRoute } from './routes/mcp-servers-route'
import { registerProvidersRoute } from './routes/providers-route'
import { registerWebSearchSettingsRoute } from './routes/web-search-settings-route'
import { registerWorkspacesRoute } from './routes/workspaces-route'
import type { DesktopBootstrap } from '../../shared/desktop-bootstrap'
import type {
  DesktopSkillCatalogPage,
  DesktopSkillCatalogQuery
} from '../../shared/desktop-discovery'
import type { UiConfig } from '../ui-config'
import type { AutoUpdateState } from '../auto-updater'
import type {
  ManagedRuntimeKind,
  ManagedRuntimesState
} from '../persistence/repos/managed-runtimes-repo'
import type { RecommendedSkillId } from '../skills/skills-manager'
import type { SkillMarketplaceRecord } from '../../shared/skill-marketplace'
import type { AgentSessionsRepository } from '../persistence/repos/agent-sessions-repo'
import type { AppAgentRuntime } from '../../shared/agent-runtime'
import { registerAgentRoute } from './routes/agent-route'
import type { AutomationsRepository } from '../persistence/repos/automations-repo'
import type { AutomationService } from '../automations/automation-service'
import { registerAutomationsRoute } from './routes/automations-route'
import { registerPermissionRulesRoute } from './routes/permission-rules-route'

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
    installRuntimeOnboardingSkills: (
      skillIds: RecommendedSkillId[]
    ) => Promise<RecommendedSkillId[]>
    listSkillsCatalogPage: (query: DesktopSkillCatalogQuery) => Promise<DesktopSkillCatalogPage>
    listSkillMarketplace: () => Promise<SkillMarketplaceRecord[]>
    installMarketplaceSkill: (input: { skillId: string }) => Promise<void>
    pickDirectory: () => Promise<string | null>
  }
  repositories?: {
    providers: ProvidersRepository
    permissionRules?: PermissionRulesRepository
    workspaces?: WorkspacesRepository
    webSearchSettings: WebSearchSettingsRepository
    mcpServers: McpServersRepository
    mcpServerHealth?: McpServerHealthRegistry
    channels: ChannelsRepository
    pairings: ChannelPairingsRepository
    agentSessions?: AgentSessionsRepository
  }
  agentRuntime?: AppAgentRuntime
  automations?: {
    repository: AutomationsRepository
    service: AutomationService
  }
  channelService?: {
    reload(): Promise<void>
  }
  channelSetupRecovery?: {
    recover(channel: { id: string; type: string }): Promise<void>
  }
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
      providersRepo: options.repositories.providers
    })
    registerChannelsRoute(app, {
      channelsRepo: options.repositories.channels,
      pairingsRepo: options.repositories.pairings,
      channelService: options.channelService ?? {
        reload: async () => undefined
      },
      channelSetupRecovery: options.channelSetupRecovery,
      whatsAppAuthStateStore: options.whatsAppAuthStateStore,
      wechatAuthStateStore: options.wechatAuthStateStore
    })
    if (options.repositories.workspaces) {
      registerWorkspacesRoute(app, {
        workspacesRepo: options.repositories.workspaces
      })
    }
    registerWebSearchSettingsRoute(app, {
      webSearchSettingsRepo: options.repositories.webSearchSettings
    })
    registerMcpServersRoute(app, {
      mcpServersRepo: options.repositories.mcpServers,
      mcpServerHealth: options.repositories.mcpServerHealth
    })
    if (options.repositories.permissionRules) {
      registerPermissionRulesRoute(app, {
        permissionRulesRepo: options.repositories.permissionRules
      })
    }
  }

  if (
    options.agentRuntime &&
    options.repositories?.agentSessions &&
    options.repositories.workspaces
  ) {
    registerAgentRoute(app, {
      runtime: options.agentRuntime,
      sessionsRepo: options.repositories.agentSessions,
      workspacesRepo: options.repositories.workspaces
    })
  }

  if (options.automations) {
    registerAutomationsRoute(app, options.automations)
  }

  return app
}

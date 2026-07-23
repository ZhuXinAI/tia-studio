import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { AppChannel, ChannelsRepository } from '../../persistence/repos/channels-repo'
import type {
  AppProvider,
  CreateProviderInput,
  ProvidersRepository,
  UpdateProviderInput
} from '../../persistence/repos/providers-repo'
import type { AutomationsRepository } from '../../persistence/repos/automations-repo'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'
import type { AppMcpServer, McpServersRepository } from '../../persistence/repos/mcp-servers-repo'
import type { AutomationService } from '../../automations/automation-service'
import {
  installMarketplaceSkill,
  listDiscoveredSkills,
  listSkillMarketplace,
  removeMarketplaceSkill
} from '../../skills/skills-manager'

type ConfirmationRequest = {
  title: string
  message: string
}

export type TiaStateManagementToolsOptions = {
  providers: ProvidersRepository
  automations: AutomationsRepository
  automationService: Pick<AutomationService, 'runNow'>
  channels: ChannelsRepository
  reloadChannels: () => Promise<void>
  workspaces: WorkspacesRepository
  mcpServers: McpServersRepository
  mcpOAuth?: {
    login(serverId: string, server: AppMcpServer): Promise<void>
    logout(serverId: string): Promise<void>
    getStatus(serverId: string): Promise<string>
  }
  workspaceRootPath: string
  globalSkillsRoot: string
  confirm: (request: ConfirmationRequest) => Promise<boolean>
}

const providerTypes = ['openai', 'openai-response', 'openrouter', 'gemini', 'anthropic', 'ollama']
const channelTypes = ['discord', 'lark', 'telegram', 'wechat', 'wecom', 'whatsapp']

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.map(text).filter((entry): entry is string => Boolean(entry))
  return values.length > 0 ? values : []
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function requireText(params: Record<string, unknown>, key: string): string {
  const value = text(params[key])
  if (!value) throw new Error(`${key} is required`)
  return value
}

function requireAction(params: Record<string, unknown>, allowed: string[]): string {
  const action = requireText(params, 'action')
  if (!allowed.includes(action)) throw new Error(`Unsupported action: ${action}`)
  return action
}

function result(summary: string, details: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: summary }],
    details
  }
}

function providerView(provider: AppProvider) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    apiHost: provider.apiHost,
    selectedModel: provider.selectedModel,
    providerModels: provider.providerModels,
    enabled: provider.enabled,
    supportsVision: provider.supportsVision,
    isBuiltIn: provider.isBuiltIn,
    isAdded: provider.isAdded,
    isDefault: provider.isDefault,
    hasApiKey: provider.apiKey.trim().length > 0,
    officialSite: provider.officialSite,
    updatedAt: provider.updatedAt
  }
}

function channelView(channel: AppChannel) {
  const config = channel.config
  const hasCredentials =
    channel.type === 'wechat' || channel.type === 'whatsapp'
      ? true
      : channel.type === 'discord' || channel.type === 'telegram'
        ? Boolean(text(config.botToken))
        : channel.type === 'wecom'
          ? Boolean(text(config.botId) && text(config.secret))
          : Boolean(text(config.appId) && text(config.appSecret))
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    enabled: channel.enabled,
    hasCredentials,
    groupRequireMention: boolean(config.groupRequireMention) ?? true,
    lastError: channel.lastError,
    updatedAt: channel.updatedAt
  }
}

function stringMap(value: unknown): Record<string, string> {
  const values = record(value)
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, entry]) => {
      const normalizedKey = key.trim()
      if (!normalizedKey || typeof entry !== 'string') return []
      return [[normalizedKey, entry]]
    })
  )
}

function mcpServerView(serverId: string, server: AppMcpServer) {
  return {
    id: serverId,
    name: server.name,
    type: server.type,
    command: server.command ?? null,
    args: server.args,
    envNames: Object.keys(server.env),
    installSource: server.installSource,
    url: server.url ?? null,
    enabled: server.isActive
  }
}

function directRemoteMcpServer(
  serverId: string,
  params: Record<string, unknown>,
  type: 'http' | 'sse'
): AppMcpServer {
  const rawUrl = requireText(params, 'url')
  let url: string
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      throw new Error('unsupported protocol')
    url = parsed.href
  } catch {
    throw new Error('url must use http:// or https://')
  }
  if (Object.keys(stringMap(params.env)).length > 0) {
    throw new Error('env is only supported for stdio MCP servers')
  }
  return {
    isActive: boolean(params.enabled) ?? true,
    name: text(params.name) ?? serverId,
    type,
    args: [],
    env: {},
    installSource: 'direct',
    url
  }
}

function stdioMcpServer(serverId: string, params: Record<string, unknown>): AppMcpServer {
  const command = requireText(params, 'command')
  return {
    isActive: boolean(params.enabled) ?? true,
    name: text(params.name) ?? serverId,
    type: 'stdio',
    command,
    args: stringList(params.args) ?? [],
    env: stringMap(params.env),
    installSource: text(params.installSource) ?? 'manual'
  }
}

function buildChannelConfig(type: string, params: Record<string, unknown>, existing?: AppChannel) {
  const current = existing?.config ?? {}
  const groupRequireMention =
    boolean(params.groupRequireMention) ?? boolean(current.groupRequireMention) ?? true
  if (type === 'discord' || type === 'telegram') {
    const botToken = text(params.botToken) ?? text(current.botToken)
    if (!botToken) throw new Error('botToken is required')
    return { ...current, botToken, groupRequireMention }
  }
  if (type === 'lark') {
    const appId = text(params.appId) ?? text(current.appId)
    const appSecret = text(params.appSecret) ?? text(current.appSecret)
    if (!appId || !appSecret) throw new Error('appId and appSecret are required')
    return { ...current, appId, appSecret, groupRequireMention }
  }
  if (type === 'wecom') {
    const botId = text(params.botId) ?? text(current.botId)
    const secret = text(params.secret) ?? text(current.secret)
    if (!botId || !secret) throw new Error('botId and secret are required')
    return { ...current, botId, secret, groupRequireMention }
  }
  if (type === 'whatsapp') return { ...current, groupRequireMention }
  if (type === 'wechat') return { ...current }
  throw new Error(`Unsupported connection type: ${type}`)
}

function saveScheduleInput(params: Record<string, unknown>, current?: Record<string, unknown>) {
  const source = { ...current, ...params }
  const rrule = requireText(source, 'rrule')
  if (!/^(RRULE:)?FREQ=(HOURLY|DAILY|WEEKLY);/.test(rrule)) {
    throw new Error('rrule must start with FREQ=HOURLY, FREQ=DAILY, or FREQ=WEEKLY')
  }
  const status = text(source.status) ?? 'active'
  if (status !== 'active' && status !== 'paused') throw new Error('status must be active or paused')
  return {
    name: requireText(source, 'name').slice(0, 120),
    prompt: requireText(source, 'prompt').slice(0, 20_000),
    status,
    rrule,
    workspaceId: requireText(source, 'workspaceId'),
    providerId: requireText(source, 'providerId'),
    modelId: requireText(source, 'modelId')
  } as const
}

async function confirm(options: TiaStateManagementToolsOptions, title: string, message: string) {
  if (!(await options.confirm({ title, message }))) {
    throw new Error('The user did not confirm this change')
  }
}

const baseParameters = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    id: { type: 'string' }
  },
  required: ['action'],
  additionalProperties: true
} as ToolDefinition['parameters']

/**
 * Application-owned capabilities for TIA Studio configuration. Secrets are accepted only
 * as write-only parameters and are deliberately excluded from every result.
 */
export function createTiaStateManagementTools(
  options: TiaStateManagementToolsOptions
): ToolDefinition[] {
  const manageProviders: ToolDefinition = {
    name: 'manage_tia_providers',
    label: 'Manage TIA providers',
    description:
      'Inspect or change TIA Studio model providers. API keys are write-only and never returned. Use only for explicit provider configuration requests; ask the user before deleting or disabling a provider.',
    promptSnippet: 'Manage TIA Studio model providers and credentials.',
    promptGuidelines: [
      'Use list before changing an existing provider when the user has not identified it precisely.',
      'Never repeat, expose, or place supplied API keys in your response.',
      'Provider deletion requires an in-app confirmation.'
    ],
    parameters: baseParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = record(rawParams)
      const action = requireAction(params, ['list', 'create', 'update', 'delete'])
      if (action === 'list') {
        const providers = await options.providers.list()
        return result(
          `Found ${providers.length} TIA provider${providers.length === 1 ? '' : 's'}.`,
          {
            providers: providers.map(providerView)
          }
        )
      }

      if (action === 'create') {
        const type = requireText(params, 'type')
        if (!providerTypes.includes(type)) throw new Error(`Unsupported provider type: ${type}`)
        const apiKey = text(params.apiKey) ?? ''
        if (type !== 'ollama' && !apiKey) throw new Error('apiKey is required')
        const provider = await options.providers.create({
          name: requireText(params, 'name'),
          type,
          apiKey,
          apiHost: text(params.apiHost) ?? null,
          selectedModel: requireText(params, 'model'),
          providerModels: stringList(params.providerModels) ?? null,
          enabled: boolean(params.enabled) ?? true,
          supportsVision: boolean(params.supportsVision) ?? false,
          isAdded: true,
          isDefault: boolean(params.isDefault) ?? false
        } satisfies CreateProviderInput)
        return result(`Created provider “${provider.name}”.`, { provider: providerView(provider) })
      }

      const providerId = requireText(params, 'id')
      const existing = await options.providers.getById(providerId)
      if (!existing) throw new Error('Provider not found')
      if (action === 'delete') {
        await confirm(
          options,
          `Remove provider ${existing.name}?`,
          existing.isBuiltIn
            ? 'This will disable the built-in provider and remove it as the default.'
            : 'This permanently removes the provider configuration from TIA Studio.'
        )
        await options.providers.delete(providerId)
        return result(
          existing.isBuiltIn
            ? `Disabled built-in provider “${existing.name}”.`
            : `Deleted provider “${existing.name}”.`,
          { id: providerId, builtIn: existing.isBuiltIn }
        )
      }

      const type = text(params.type)
      if (type && !providerTypes.includes(type))
        throw new Error(`Unsupported provider type: ${type}`)
      const updates: UpdateProviderInput = {
        ...(text(params.name) ? { name: text(params.name) } : {}),
        ...(type ? { type } : {}),
        ...(text(params.apiKey) ? { apiKey: text(params.apiKey) } : {}),
        ...(params.apiHost === null
          ? { apiHost: null }
          : text(params.apiHost)
            ? { apiHost: text(params.apiHost) }
            : {}),
        ...(text(params.model) ? { selectedModel: text(params.model) } : {}),
        ...(Array.isArray(params.providerModels)
          ? { providerModels: stringList(params.providerModels) }
          : {}),
        ...(boolean(params.enabled) !== undefined ? { enabled: boolean(params.enabled) } : {}),
        ...(boolean(params.supportsVision) !== undefined
          ? { supportsVision: boolean(params.supportsVision) }
          : {}),
        ...(boolean(params.isDefault) !== undefined ? { isDefault: boolean(params.isDefault) } : {})
      }
      if (Object.keys(updates).length === 0)
        throw new Error('Provide at least one provider field to update')
      const provider = await options.providers.update(providerId, updates)
      if (!provider) throw new Error('Provider not found')
      return result(`Updated provider “${provider.name}”.`, { provider: providerView(provider) })
    }
  }

  const manageSchedules: ToolDefinition = {
    name: 'manage_tia_schedules',
    label: 'Manage TIA schedules',
    description:
      'Inspect, create, edit, pause, resume, delete, or run TIA Studio schedules. Schedules create ordinary Pi threads and always run with Standard Access.',
    promptSnippet: 'Manage TIA Studio schedules and scheduled Pi work.',
    promptGuidelines: [
      'Use list to retrieve schedule IDs and the available workspace/provider IDs before creating a schedule.',
      'Do not run a schedule immediately or delete one without an in-app confirmation.',
      'Use supported RRULE values only: HOURLY, DAILY, or WEEKLY.'
    ],
    parameters: baseParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = record(rawParams)
      const action = requireAction(params, [
        'list',
        'create',
        'update',
        'pause',
        'resume',
        'delete',
        'run'
      ])
      if (action === 'list') {
        const [schedules, workspaces, providers] = await Promise.all([
          options.automations.list(),
          options.workspaces.list(),
          options.providers.list()
        ])
        return result(
          `Found ${schedules.length} TIA schedule${schedules.length === 1 ? '' : 's'}.`,
          {
            schedules,
            workspaces: workspaces.map(({ id, name, builtInKind, isMissing }) => ({
              id,
              name,
              builtInKind,
              isMissing
            })),
            providers: providers.filter((provider) => provider.enabled).map(providerView)
          }
        )
      }

      if (action === 'create') {
        const input = saveScheduleInput(params)
        const [workspace, provider] = await Promise.all([
          options.workspaces.getById(input.workspaceId),
          options.providers.getById(input.providerId)
        ])
        if (!workspace || workspace.isMissing) throw new Error('Schedule workspace is unavailable')
        if (!provider || !provider.enabled) throw new Error('Schedule provider is unavailable')
        const schedule = await options.automations.create(input)
        return result(`Created schedule “${schedule.name}”.`, { schedule })
      }

      const id = requireText(params, 'id')
      const existing = await options.automations.getById(id)
      if (!existing) throw new Error('Schedule not found')
      if (action === 'delete') {
        await confirm(
          options,
          `Delete schedule ${existing.name}?`,
          'This permanently removes the schedule and its future runs.'
        )
        await options.automations.delete(id)
        return result(`Deleted schedule “${existing.name}”.`, { id })
      }
      if (action === 'run') {
        await confirm(
          options,
          `Run schedule ${existing.name} now?`,
          'This starts a new TIA Pi thread with the saved prompt.'
        )
        const schedule = await options.automationService.runNow(id)
        return result(`Started schedule “${schedule.name}”.`, { schedule })
      }

      const input = saveScheduleInput(
        action === 'pause'
          ? { ...params, status: 'paused' }
          : action === 'resume'
            ? { ...params, status: 'active' }
            : params,
        existing
      )
      const schedule = await options.automations.update(id, input)
      if (!schedule) throw new Error('Schedule not found')
      return result(
        `${action === 'pause' ? 'Paused' : action === 'resume' ? 'Resumed' : 'Updated'} schedule “${schedule.name}”.`,
        { schedule }
      )
    }
  }

  const manageConnections: ToolDefinition = {
    name: 'manage_tia_connections',
    label: 'Manage TIA connections',
    description:
      'Inspect and manage TIA Studio channel connections: Discord, Lark, Telegram, WeChat, WeCom, and WhatsApp. Connection credentials are write-only and never returned.',
    promptSnippet: 'Manage TIA Studio channel connections.',
    promptGuidelines: [
      'Use list before updating or removing a connection unless the user gave its exact ID.',
      'Never expose bot tokens, app secrets, or other connection credentials.',
      'Deleting a connection requires an in-app confirmation and reloads the channel service.'
    ],
    parameters: baseParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = record(rawParams)
      const action = requireAction(params, [
        'list',
        'create',
        'update',
        'enable',
        'disable',
        'delete'
      ])
      if (action === 'list') {
        const connections = await options.channels.list()
        return result(
          `Found ${connections.length} TIA connection${connections.length === 1 ? '' : 's'}.`,
          {
            connections: connections.map(channelView)
          }
        )
      }

      if (action === 'create') {
        const type = requireText(params, 'type')
        if (!channelTypes.includes(type)) throw new Error(`Unsupported connection type: ${type}`)
        const channel = await options.channels.create({
          type,
          name: requireText(params, 'name'),
          enabled: boolean(params.enabled) ?? true,
          config: buildChannelConfig(type, params)
        })
        await options.reloadChannels()
        return result(`Created connection “${channel.name}”.`, { connection: channelView(channel) })
      }

      const id = requireText(params, 'id')
      const existing = await options.channels.getById(id)
      if (!existing) throw new Error('Connection not found')
      if (action === 'delete') {
        await confirm(
          options,
          `Remove connection ${existing.name}?`,
          'This removes its saved configuration from TIA Studio and stops its adapter.'
        )
        await options.channels.delete(id)
        await options.reloadChannels()
        return result(`Deleted connection “${existing.name}”.`, { id })
      }

      const enabled =
        action === 'enable' ? true : action === 'disable' ? false : boolean(params.enabled)
      const channel = await options.channels.update(id, {
        ...(text(params.name) ? { name: text(params.name) } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(action === 'update'
          ? { config: buildChannelConfig(existing.type, params, existing) }
          : {})
      })
      if (!channel) throw new Error('Connection not found')
      await options.reloadChannels()
      return result(
        `${action === 'enable' ? 'Enabled' : action === 'disable' ? 'Disabled' : 'Updated'} connection “${channel.name}”.`,
        {
          connection: channelView(channel)
        }
      )
    }
  }

  const manageMcpServers: ToolDefinition = {
    name: 'manage_tia_mcp_servers',
    label: 'Manage TIA MCP servers',
    description:
      'Inspect and manage MCP servers used by TIA Pi threads. Interpret common MCP JSON and commands, including Claude CLI commands. For remote HTTP or SSE servers that require authentication, use the built-in sign_in action so TIA can open the browser OAuth flow.',
    promptSnippet: 'Manage TIA Studio MCP server configuration and authenticated remote MCPs.',
    promptGuidelines: [
      'Use list before changing an existing MCP server unless the user gave its exact ID.',
      'For a remote URL, use create_http or create_sse. TIA Studio uses direct MCP OAuth and keeps credentials only in ~/.tia-studio/mcp-auth.json.',
      'Never ask for, return, or promise to reuse credentials from another app. When a remote server needs OAuth, call sign_in after the server exists; TIA opens the browser and stores credentials only in its local authentication storage.',
      'TIA maps npx and bunx through its managed Bun runtime for stdio servers when Bun is installed. Tell the user to finish Runtime Setup if a stdio server cannot launch.',
      'Creating, updating, enabling, deleting, signing in, or signing out changes a local integration or credential state, so require the built-in confirmation.'
    ],
    parameters: baseParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = record(rawParams)
      const action = requireAction(params, [
        'list',
        'create_stdio',
        'create_http',
        'create_sse',
        'update',
        'enable',
        'disable',
        'delete',
        'sign_in',
        'sign_out'
      ])
      const settings = await options.mcpServers.getSettings()

      if (action === 'list') {
        const servers = Object.entries(settings.mcpServers).map(([serverId, server]) =>
          mcpServerView(serverId, server)
        )
        return result(`Found ${servers.length} MCP server${servers.length === 1 ? '' : 's'}.`, {
          servers,
          remoteAuthGuidance:
            'For authenticated remote HTTP or SSE servers, create a direct server, then use sign_in. OAuth credentials are stored only in ~/.tia-studio/mcp-auth.json.',
          bunGuidance:
            'TIA automatically uses managed Bun as bun x for npx or bunx commands when Bun is installed in Runtime Setup.'
        })
      }

      const serverId = requireText(params, 'id')
      if (action === 'create_stdio' || action === 'create_http' || action === 'create_sse') {
        if (settings.mcpServers[serverId]) throw new Error('An MCP server already uses this id')
        const server =
          action === 'create_http' || action === 'create_sse'
            ? directRemoteMcpServer(serverId, params, action === 'create_http' ? 'http' : 'sse')
            : stdioMcpServer(serverId, params)
        await confirm(
          options,
          `Add MCP server ${server.name}?`,
          action === 'create_http' || action === 'create_sse'
            ? 'TIA will connect directly to this MCP server. If it requires OAuth, TIA can start browser sign-in and will keep credentials only in TIA Studio local authentication storage.'
            : `TIA will launch ${server.command} when a Pi thread starts. Review the command and environment variables before continuing.`
        )
        const saved = await options.mcpServers.saveSettings({
          mcpServers: { ...settings.mcpServers, [serverId]: server }
        })
        return result(`Created MCP server “${server.name}”.`, {
          server: mcpServerView(serverId, saved.mcpServers[serverId]!)
        })
      }

      const existing = settings.mcpServers[serverId]
      if (!existing) throw new Error('MCP server not found')
      if (action === 'sign_in' || action === 'sign_out') {
        const transport = existing.type.trim().toLowerCase()
        if ((transport !== 'http' && transport !== 'sse') || !existing.url) {
          throw new Error('Only HTTP or SSE MCP servers support browser OAuth')
        }
        if (!options.mcpOAuth) throw new Error('MCP OAuth is not available')
        if (action === 'sign_in') {
          await confirm(
            options,
            `Sign in to ${existing.name}?`,
            'TIA will open this server’s browser OAuth flow. Credentials are stored only in TIA Studio local authentication storage.'
          )
          await options.mcpOAuth.login(serverId, existing)
          return result(`Signed in to MCP server “${existing.name}”.`, {
            server: mcpServerView(serverId, existing),
            auth: await options.mcpOAuth.getStatus(serverId)
          })
        }
        await confirm(
          options,
          `Sign out of ${existing.name}?`,
          'This clears the local OAuth credentials that TIA Studio stored for this MCP server.'
        )
        await options.mcpOAuth.logout(serverId)
        return result(`Signed out of MCP server “${existing.name}”.`, {
          server: mcpServerView(serverId, existing),
          auth: await options.mcpOAuth.getStatus(serverId)
        })
      }
      if (action === 'delete') {
        await confirm(
          options,
          `Remove MCP server ${existing.name}?`,
          'This removes the saved configuration. Running Pi threads keep their already-open MCP client until the thread closes.'
        )
        const mcpServers = { ...settings.mcpServers }
        delete mcpServers[serverId]
        await options.mcpServers.saveSettings({ mcpServers })
        return result(`Deleted MCP server “${existing.name}”.`, { id: serverId })
      }

      const updated: AppMcpServer = {
        ...existing,
        ...(action === 'enable' ? { isActive: true } : {}),
        ...(action === 'disable' ? { isActive: false } : {}),
        ...(action === 'update'
          ? {
              ...(text(params.name) ? { name: text(params.name) } : {}),
              ...(text(params.command) ? { command: text(params.command) } : {}),
              ...(Array.isArray(params.args) ? { args: stringList(params.args) ?? [] } : {}),
              ...(params.env !== undefined ? { env: stringMap(params.env) } : {}),
              ...(text(params.installSource) ? { installSource: text(params.installSource) } : {})
            }
          : {})
      }
      if (action === 'update' && updated.type === 'stdio' && !updated.command) {
        throw new Error('command is required for a stdio MCP server')
      }
      await confirm(
        options,
        `${action === 'enable' ? 'Enable' : action === 'disable' ? 'Disable' : 'Update'} MCP server ${existing.name}?`,
        action === 'enable'
          ? 'TIA may launch this local MCP command when a Pi thread starts.'
          : 'This changes the MCP server configuration used by future Pi threads.'
      )
      const saved = await options.mcpServers.saveSettings({
        mcpServers: { ...settings.mcpServers, [serverId]: updated }
      })
      return result(
        `${action === 'enable' ? 'Enabled' : action === 'disable' ? 'Disabled' : 'Updated'} MCP server “${updated.name}”.`,
        { server: mcpServerView(serverId, saved.mcpServers[serverId]!) }
      )
    }
  }

  const manageSkills: ToolDefinition = {
    name: 'manage_tia_skills',
    label: 'Manage TIA skills',
    description:
      'List installed TIA skills, browse the curated skills catalog, install a catalog skill globally, or remove a TIA-owned global catalog skill. Skills are code/instructions from third parties, so installation and removal require confirmation.',
    promptSnippet: 'Manage TIA Studio skills and the curated skill catalog.',
    promptGuidelines: [
      'Use list_installed or list_catalog before installing a skill.',
      'Only catalog skills can be installed by this tool; do not invent package names or URLs.',
      'Explain what a skill does and require the built-in confirmation before installation or removal.'
    ],
    parameters: baseParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = record(rawParams)
      const action = requireAction(params, ['list_installed', 'list_catalog', 'install', 'remove'])
      if (action === 'list_installed') {
        const skills = await listDiscoveredSkills({
          workspaceRootPath: options.workspaceRootPath,
          includeWorkspaceSource: true
        })
        return result(`Found ${skills.length} installed skill${skills.length === 1 ? '' : 's'}.`, {
          skills
        })
      }
      if (action === 'list_catalog') {
        const skills = await listSkillMarketplace({ globalSkillsRoot: options.globalSkillsRoot })
        return result(`Found ${skills.length} curated skill${skills.length === 1 ? '' : 's'}.`, {
          skills
        })
      }

      const skillId = requireText(params, 'skillId')
      if (action === 'install') {
        await confirm(
          options,
          `Install skill ${skillId}?`,
          'This downloads a third-party skill bundle into TIA Studio global storage, making it available to all TIA workspaces.'
        )
        await installMarketplaceSkill({ skillId, globalSkillsRoot: options.globalSkillsRoot })
        return result(`Installed skill “${skillId}”.`, { skillId })
      }
      await confirm(
        options,
        `Remove skill ${skillId}?`,
        'This removes the TIA-owned global catalog skill from every TIA workspace.'
      )
      await removeMarketplaceSkill({ skillId, globalSkillsRoot: options.globalSkillsRoot })
      return result(`Removed skill “${skillId}”.`, { skillId })
    }
  }

  return [manageProviders, manageSchedules, manageConnections, manageMcpServers, manageSkills]
}

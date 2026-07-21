import { describe, expect, it, vi } from 'vitest'
import type { AppProvider, ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { ChannelsRepository } from '../../persistence/repos/channels-repo'
import type { AutomationsRepository } from '../../persistence/repos/automations-repo'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'
import type { McpServersRepository } from '../../persistence/repos/mcp-servers-repo'
import { createTiaStateManagementTools } from './tia-state-management-tools'

const provider: AppProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  type: 'openai',
  apiKey: 'never-return-this',
  apiHost: null,
  selectedModel: 'gpt-5.4',
  selectedModelContextWindowTokens: null,
  providerModels: ['gpt-5.4'],
  enabled: true,
  supportsVision: true,
  isBuiltIn: false,
  isAdded: true,
  isDefault: true,
  icon: null,
  officialSite: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z'
}

function createTools(overrides: Record<string, unknown> = {}) {
  const defaultConfirm = vi.fn<(request: { title: string; message: string }) => Promise<boolean>>(
    async () => true
  )
  const confirm =
    (overrides.confirm as
      | ((request: { title: string; message: string }) => Promise<boolean>)
      | undefined) ?? defaultConfirm
  const tools = createTiaStateManagementTools({
    providers: {
      list: vi.fn(async () => [provider]),
      getById: vi.fn(async () => provider),
      create: vi.fn(async () => provider),
      update: vi.fn(async () => provider),
      delete: vi.fn(async () => true)
    } as unknown as ProvidersRepository,
    automations: {
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(async () => true)
    } as unknown as AutomationsRepository,
    automationService: { runNow: vi.fn() } as never,
    channels: {
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(async () => true)
    } as unknown as ChannelsRepository,
    reloadChannels: vi.fn(async () => undefined),
    workspaces: {
      list: vi.fn(async () => []),
      getById: vi.fn()
    } as unknown as WorkspacesRepository,
    mcpServers: {
      getSettings: vi.fn(async () => ({ mcpServers: {} })),
      saveSettings: vi.fn(async (settings) => settings)
    } as unknown as McpServersRepository,
    workspaceRootPath: '/tmp/workspace',
    globalSkillsRoot: '/tmp/tia-skills',
    confirm,
    ...overrides
  })
  return { tools, confirm }
}

async function execute(
  tools: ReturnType<typeof createTiaStateManagementTools>,
  name: string,
  params: unknown
) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Tool ${name} not found`)
  return tool.execute('call-1', params, undefined as never, undefined as never, undefined as never)
}

describe('TIA state management tools', () => {
  it('lists providers without exposing API keys', async () => {
    const { tools, confirm } = createTools()

    const output = await execute(tools, 'manage_tia_providers', { action: 'list' })
    const serialized = JSON.stringify(output)

    expect(serialized).not.toContain('never-return-this')
    expect(serialized).toContain('hasApiKey')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('reloads the channel service after creating a connection and redacts its token', async () => {
    const reloadChannels = vi.fn(async () => undefined)
    const channel = {
      id: 'channel-1',
      type: 'telegram',
      name: 'Team bot',
      enabled: true,
      config: { botToken: 'never-return-this' },
      lastError: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z'
    }
    const channels = {
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      create: vi.fn(async () => channel),
      update: vi.fn(),
      delete: vi.fn(async () => true)
    } as unknown as ChannelsRepository
    const { tools } = createTools({ channels, reloadChannels })

    const output = await execute(tools, 'manage_tia_connections', {
      action: 'create',
      type: 'telegram',
      name: 'Team bot',
      botToken: 'never-return-this'
    })

    expect(reloadChannels).toHaveBeenCalledOnce()
    expect(JSON.stringify(output)).not.toContain('never-return-this')
  })

  it('requires confirmation before deleting a provider', async () => {
    const { tools, confirm } = createTools({ confirm: vi.fn(async () => false) })

    await expect(
      execute(tools, 'manage_tia_providers', { action: 'delete', id: provider.id })
    ).rejects.toThrow('did not confirm')
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('creates authenticated remote MCPs through mcp-remote without returning env values', async () => {
    const saveSettings = vi.fn(async (settings) => settings)
    const { tools, confirm } = createTools({
      mcpServers: {
        getSettings: vi.fn(async () => ({ mcpServers: {} })),
        saveSettings
      } as unknown as McpServersRepository
    })

    const output = await execute(tools, 'manage_tia_mcp_servers', {
      action: 'create_remote',
      id: 'linear',
      name: 'Linear',
      url: 'https://mcp.linear.app/sse',
      resource: 'https://acme.linear.app/',
      env: { SHOULD_NOT_BE_RETURNED: 'secret' }
    })

    expect(confirm).toHaveBeenCalledOnce()
    expect(saveSettings).toHaveBeenCalledWith({
      mcpServers: {
        linear: {
          isActive: true,
          name: 'Linear',
          type: 'stdio',
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            'https://mcp.linear.app/sse',
            '--resource',
            'https://acme.linear.app/'
          ],
          env: { SHOULD_NOT_BE_RETURNED: 'secret' },
          installSource: 'mcp-remote',
          url: 'https://mcp.linear.app/sse'
        }
      }
    })
    expect(JSON.stringify(output)).not.toContain('secret')
    expect(JSON.stringify(output)).toContain('SHOULD_NOT_BE_RETURNED')
  })
})

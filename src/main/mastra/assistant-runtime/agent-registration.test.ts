import { describe, expect, it, vi } from 'vitest'
import { ChannelEventBus } from '../../channels/channel-event-bus'
import type { AppAssistant } from '../../persistence/repos/assistants-repo'
import type { AppProvider } from '../../persistence/repos/providers-repo'
import { buildAssistantTools, buildAgentRegistrationSignature } from './agent-registration'

function buildAssistant(overrides?: Partial<AppAssistant>): AppAssistant {
  return {
    id: 'assistant-1',
    name: 'TIA',
    description: 'Handles general assistant requests.',
    instructions: 'You are helpful.',
    enabled: true,
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/tmp/workspace' },
    skillsConfig: {},
    mcpConfig: {},
    maxSteps: 100,
    memoryConfig: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides
  }
}

function buildProvider(overrides?: Partial<AppProvider>): AppProvider {
  return {
    id: 'provider-1',
    name: 'openai',
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-4.1',
    providerModels: null,
    enabled: true,
    supportsVision: false,
    isBuiltIn: false,
    icon: null,
    officialSite: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides
  }
}

describe('agent registration helpers', () => {
  it('builds the assistant tool map with workspace, cron, channel, memory, MCP, and browser tools', () => {
    const tools = buildAssistantTools({
      assistantId: 'assistant-1',
      workspaceRootPath: '/tmp/workspace',
      channelDeliveryEnabled: true,
      cronToolsEnabled: true,
      resolveKeepBrowserWindowOpen: async () => false,
      resolveShowBrowser: async () => false,
      builtInBrowserManager: {
        requestHumanHandoff: vi.fn(async () => ({
          status: 'completed' as const,
          currentUrl: 'https://example.test',
          remoteDebuggingPort: 10531
        }))
      } as never,
      memory: {
        deleteThread: vi.fn(),
        getThreadById: vi.fn(),
        listThreads: vi.fn()
      } as never,
      mcpTools: {
        mcpEcho: {} as never
      },
      channelEventBus: new ChannelEventBus(),
      cronJobService: {
        createCronJob: vi.fn(),
        listAssistantCronJobs: vi.fn(async () => []),
        removeAssistantCronJob: vi.fn(async () => true)
      },
      resolveRecentConversations: vi.fn(async () => [])
    })

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'webFetch',
        'requestBrowserHumanHandoff',
        'readSoulMemory',
        'updateSoulMemory',
        'listWorkLogs',
        'readWorkLog',
        'searchWorkLogs',
        'createCronJob',
        'listCronJobs',
        'removeCronJob',
        'sendMessageToChannel',
        'sendImage',
        'sendFile',
        'cleanupMemorySessions',
        'mcpEcho'
      ])
    )
  })

  it('computes a stable signature from assistant, provider, and runtime inputs', () => {
    const assistant = buildAssistant()
    const provider = buildProvider()
    const guardrailConfig = {
      promptInjectionEnabled: false,
      piiDetectionEnabled: false,
      requestedProviderId: null,
      provider,
      source: 'assistant' as const
    }
    const enabledMcpServers = {
      filesystem: {
        isActive: true,
        name: 'Filesystem',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: {},
        installSource: 'manual'
      }
    }

    const first = buildAgentRegistrationSignature({
      assistant,
      provider,
      guardrailConfig,
      enabledMcpServers,
      registrationOptions: {
        channelDeliveryEnabled: true,
        channelType: 'lark',
        cronToolsEnabled: true
      }
    })
    const second = buildAgentRegistrationSignature({
      assistant,
      provider,
      guardrailConfig,
      enabledMcpServers,
      registrationOptions: {
        channelDeliveryEnabled: true,
        channelType: 'lark',
        cronToolsEnabled: true
      }
    })
    const changed = buildAgentRegistrationSignature({
      assistant,
      provider,
      guardrailConfig,
      enabledMcpServers,
      registrationOptions: {
        channelDeliveryEnabled: false,
        cronToolsEnabled: true
      }
    })

    expect(first).toBe(second)
    expect(changed).not.toBe(first)
  })
})

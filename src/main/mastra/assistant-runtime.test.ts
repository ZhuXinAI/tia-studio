import os from 'node:os'
import path from 'node:path'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import type { UIMessageChunk } from 'ai'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { AppProvider } from '../persistence/repos/providers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ManagedRuntimesState } from '../persistence/repos/managed-runtimes-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import { ChannelEventBus } from '../channels/channel-event-bus'
import { AssistantRuntimeService } from './assistant-runtime'
import * as modelResolver from './model-resolver'
import { buildOpenAIProviderOptions } from './openai-provider-options'
import { createMastraInstance } from './store'

const { handleChatStreamMock, toAISdkV5MessagesMock, generateTextMock } = vi.hoisted(() => ({
  handleChatStreamMock: vi.fn(),
  toAISdkV5MessagesMock: vi.fn(),
  generateTextMock: vi.fn()
}))

vi.mock('@mastra/ai-sdk', () => ({
  handleChatStream: (options: unknown) => handleChatStreamMock(options)
}))

vi.mock('@mastra/ai-sdk/ui', () => ({
  toAISdkV5Messages: (messages: unknown) => toAISdkV5MessagesMock(messages)
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: (options: unknown) => generateTextMock(options)
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/tia-studio-test'
  },
  BrowserWindow: undefined
}))

function buildAssistant(overrides?: Partial<AppAssistant>): AppAssistant {
  return {
    id: 'assistant-1',
    name: 'TIA',
    description: 'Handles general assistant requests.',
    instructions: 'You are helpful.',
    enabled: true,
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/tmp' },
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
    selectedModelContextWindowTokens: null,
    providerModels: null,
    enabled: true,
    supportsVision: false,
    isBuiltIn: false,
    isAdded: true,
    isDefault: false,
    icon: null,
    officialSite: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides
  }
}

function buildManagedRuntimeState(
  readyKinds: Array<'codex-acp' | 'claude-agent-acp'>
): ManagedRuntimesState {
  const isReady = (kind: 'codex-acp' | 'claude-agent-acp'): boolean => readyKinds.includes(kind)

  return {
    bun: {
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'missing',
      errorMessage: null
    },
    uv: {
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'missing',
      errorMessage: null
    },
    'agent-browser': {
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'missing',
      errorMessage: null
    },
    'codex-acp': {
      source: isReady('codex-acp') ? 'managed' : 'none',
      binaryPath: isReady('codex-acp') ? '/managed/bin/codex-acp' : null,
      version: isReady('codex-acp') ? 'codex-acp 0.10.0' : null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: isReady('codex-acp') ? 'ready' : 'missing',
      errorMessage: null
    },
    'claude-agent-acp': {
      source: isReady('claude-agent-acp') ? 'managed' : 'none',
      binaryPath: isReady('claude-agent-acp') ? '/managed/bin/claude-agent-acp' : null,
      version: isReady('claude-agent-acp') ? 'claude-agent-acp 0.22.2' : null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: isReady('claude-agent-acp') ? 'ready' : 'missing',
      errorMessage: null
    }
  }
}

async function drainStream(stream: ReadableStream<UIMessageChunk>): Promise<void> {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done } = await reader.read()
      if (done) {
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function getAgentInstructions(agent: unknown): Promise<string> {
  const instructions = await (
    agent as {
      getInstructions: (options: { requestContext: RequestContext }) => Promise<unknown>
    }
  ).getInstructions({
    requestContext: new RequestContext()
  })

  if (typeof instructions === 'string') {
    return instructions
  }

  return JSON.stringify(instructions)
}

describe('AssistantRuntimeService', () => {
  it('passes only workspace-relative skills directories to Mastra workspace skills', () => {
    const runtime = new AssistantRuntimeService({
      mastra: {} as Mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {} as ThreadsRepository,
      webSearchSettingsRepo: {} as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    const workspaceRoot = '/tmp/workspace'
    const skillsPaths = (
      runtime as unknown as {
        resolveSkillsPaths: (
          workspaceRootPath: string,
          skillsConfig: Record<string, unknown>
        ) => string[]
      }
    ).resolveSkillsPaths(workspaceRoot, {})

    expect(skillsPaths).toEqual(['skills'])
  })

  it('filters absolute skill paths outside the workspace', () => {
    const runtime = new AssistantRuntimeService({
      mastra: {} as Mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {} as ThreadsRepository,
      webSearchSettingsRepo: {} as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    const workspaceRoot = '/tmp/workspace'
    const skillsPaths = (
      runtime as unknown as {
        resolveSkillsPaths: (
          workspaceRootPath: string,
          skillsConfig: Record<string, unknown>
        ) => string[]
      }
    ).resolveSkillsPaths(workspaceRoot, {
      paths: [
        path.join(os.homedir(), '.claude', 'skills'),
        path.join(workspaceRoot, 'extra-skills'),
        './project-skills'
      ]
    })

    expect(skillsPaths).toEqual(['skills', 'extra-skills', 'project-skills'])
  })

  it('registers agents with memory enabled', async () => {
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: { getById: vi.fn() } as unknown as AssistantsRepository,
      providersRepo: { getById: vi.fn() } as unknown as ProvidersRepository,
      threadsRepo: { getById: vi.fn() } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(buildAssistant(), buildProvider())

    const agent = mastra.getAgentById('assistant-1')
    expect(agent.hasOwnMemory()).toBe(true)
    expect(agent.hasOwnWorkspace()).toBe(true)

    const memory = await agent.getMemory()
    expect(memory?.getMergedThreadConfig().generateTitle).toBe(true)
  })

  it('registers Codex ACP and Claude Agent ACP coding subagents from assistant config', async () => {
    const assistant = buildAssistant({
      workspaceConfig: {
        rootPath: '/tmp',
        codingAgents: {
          'codex-acp': {
            enabled: true,
            providerId: 'provider-codex'
          },
          'claude-agent-acp': {
            enabled: true,
            providerId: 'provider-claude'
          }
        }
      }
    })
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: { getById: vi.fn() } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (providerId: string) => {
          if (providerId === 'provider-codex') {
            return buildProvider({
              id: 'provider-codex',
              name: 'Codex ACP',
              type: 'codex-acp',
              apiKey: '',
              apiHost: null,
              selectedModel: 'default',
              enabled: false,
              isBuiltIn: true
            })
          }

          if (providerId === 'provider-claude') {
            return buildProvider({
              id: 'provider-claude',
              name: 'Claude Agent ACP',
              type: 'claude-agent-acp',
              apiKey: '',
              apiHost: null,
              selectedModel: 'default',
              enabled: false,
              isBuiltIn: true
            })
          }

          return buildProvider()
        })
      } as unknown as ProvidersRepository,
      threadsRepo: { getById: vi.fn() } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      managedRuntimeResolver: {
        getStatus: vi.fn(async () => buildManagedRuntimeState(['codex-acp', 'claude-agent-acp'])),
        resolveManagedCommand: vi.fn(async (command: string, args: string[], env = {}) => ({
          command,
          args,
          env
        }))
      }
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(assistant, buildProvider())

    expect(mastra.getAgentById('assistant-1:coding-agent:codex-acp')).toBeDefined()
    expect(mastra.getAgentById('assistant-1:coding-agent:claude-agent-acp')).toBeDefined()
    await expect(getAgentInstructions(mastra.getAgentById('assistant-1'))).resolves.toContain(
      'Available coding targets: codex-acp, claude-agent-acp.'
    )
  })

  it('adds channel splitter guidance only for channel-targeted runs', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'finish' } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const provider = buildProvider()
    const threadRecord = {
      id: 'thread-1',
      assistantId: assistant.id,
      resourceId: 'profile-1',
      title: 'New Thread',
      lastMessageAt: null,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }

    const channelMastra = await createMastraInstance(':memory:')
    const channelRuntime = new AssistantRuntimeService({
      mastra: channelMastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => provider)
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => threadRecord),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await drainStream(
      await channelRuntime.streamChat({
        assistantId: assistant.id,
        threadId: threadRecord.id,
        profileId: threadRecord.resourceId,
        messages: [],
        channelTarget: {
          channelId: 'channel-1',
          channelType: 'lark',
          remoteChatId: 'chat-1'
        }
      })
    )

    await expect(getAgentInstructions(channelMastra.getAgentById(assistant.id))).resolves.toContain(
      'When you want to split a reply into multiple channel messages, insert [[BR]]'
    )

    const plainMastra = await createMastraInstance(':memory:')
    const plainRuntime = new AssistantRuntimeService({
      mastra: plainMastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => provider)
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => threadRecord),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await drainStream(
      await plainRuntime.streamChat({
        assistantId: assistant.id,
        threadId: threadRecord.id,
        profileId: threadRecord.resourceId,
        messages: []
      })
    )

    await expect(
      getAgentInstructions(plainMastra.getAgentById(assistant.id))
    ).resolves.not.toContain(
      'When you want to split a reply into multiple channel messages, insert [[BR]]'
    )
  })

  it('tells channel-targeted runs when sendImage is available or unavailable', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'finish' } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const provider = buildProvider()
    const threadRecord = {
      id: 'thread-1',
      assistantId: assistant.id,
      resourceId: 'profile-1',
      title: 'New Thread',
      lastMessageAt: null,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }

    const telegramMastra = await createMastraInstance(':memory:')
    const telegramRuntime = new AssistantRuntimeService({
      mastra: telegramMastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => provider)
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => threadRecord),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await drainStream(
      await telegramRuntime.streamChat({
        assistantId: assistant.id,
        threadId: threadRecord.id,
        profileId: threadRecord.resourceId,
        messages: [],
        channelTarget: {
          channelId: 'channel-1',
          channelType: 'telegram',
          remoteChatId: 'chat-1'
        }
      })
    )

    await expect(
      getAgentInstructions(telegramMastra.getAgentById(assistant.id))
    ).resolves.toContain('This channel supports sendImage')

    const wecomMastra = await createMastraInstance(':memory:')
    const wecomRuntime = new AssistantRuntimeService({
      mastra: wecomMastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => provider)
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => threadRecord),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await drainStream(
      await wecomRuntime.streamChat({
        assistantId: assistant.id,
        threadId: threadRecord.id,
        profileId: threadRecord.resourceId,
        messages: [],
        channelTarget: {
          channelId: 'channel-1',
          channelType: 'wecom',
          remoteChatId: 'chat-1'
        }
      })
    )

    await expect(getAgentInstructions(wecomMastra.getAgentById(assistant.id))).resolves.toContain(
      'WeCom does not support sendImage right now'
    )
  })

  it('adds shared web fetch guidance to agent instructions', async () => {
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {
        hasAnyThreads: vi.fn(async () => true)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(buildAssistant(), buildProvider())

    const instructions = await getAgentInstructions(mastra.getAgentById('assistant-1'))

    expect(instructions).toContain('Use webFetch only when you already know the exact page URL')
    expect(instructions).toContain(
      'Use agent-browser, Playwright MCP, or another browser-oriented tool'
    )
    expect(instructions).toContain('recommend agent-browser, Playwright MCP, or installing')
    expect(instructions).toContain(
      'Fall back to webFetch only when richer browser tooling is unavailable'
    )
  })

  it('bootstraps assistant workspace files when registering an agent', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-runtime-'))

    try {
      const assistant = buildAssistant({
        workspaceConfig: {
          rootPath: workspaceRoot
        }
      })
      const mastra = await createMastraInstance(':memory:')
      const runtime = new AssistantRuntimeService({
        mastra,
        assistantsRepo: {} as AssistantsRepository,
        providersRepo: {} as ProvidersRepository,
        threadsRepo: {} as ThreadsRepository,
        webSearchSettingsRepo: {
          getDefaultEngine: vi.fn(async () => 'bing')
        } as unknown as WebSearchSettingsRepository,
        mcpServersRepo: {
          getSettings: vi.fn(async () => ({ mcpServers: {} }))
        } as never,
        channelEventBus: new ChannelEventBus()
      })

      await (
        runtime as unknown as {
          ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
        }
      ).ensureAgentRegistered(assistant, buildProvider())

      await expect(access(path.join(workspaceRoot, 'IDENTITY.md'))).resolves.toBeUndefined()
      await expect(access(path.join(workspaceRoot, 'SOUL.md'))).resolves.toBeUndefined()
      await expect(access(path.join(workspaceRoot, 'MEMORY.md'))).resolves.toBeUndefined()
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('adds workspace-root path guidance during first-conversation onboarding', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-runtime-'))

    try {
      const assistant = buildAssistant({
        workspaceConfig: {
          rootPath: workspaceRoot
        }
      })
      const mastra = await createMastraInstance(':memory:')
      const runtime = new AssistantRuntimeService({
        mastra,
        assistantsRepo: {} as AssistantsRepository,
        providersRepo: {} as ProvidersRepository,
        threadsRepo: {
          hasAnyThreads: vi.fn(async () => false)
        } as unknown as ThreadsRepository,
        webSearchSettingsRepo: {
          getDefaultEngine: vi.fn(async () => 'bing')
        } as unknown as WebSearchSettingsRepository,
        mcpServersRepo: {
          getSettings: vi.fn(async () => ({ mcpServers: {} }))
        } as never,
        channelEventBus: new ChannelEventBus()
      })

      await (
        runtime as unknown as {
          ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
        }
      ).ensureAgentRegistered(assistant, buildProvider())

      const instructions = await getAgentInstructions(mastra.getAgentById(assistant.id))
      expect(instructions).toContain('These files live directly at the workspace root')
      expect(instructions).toContain(
        'Use workspace-root paths like `IDENTITY.md` or `/IDENTITY.md`'
      )
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('registers soul and channel tools for assistants with workspaces', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-runtime-'))

    try {
      const assistant = buildAssistant({
        workspaceConfig: {
          rootPath: workspaceRoot
        }
      })
      const mastra = await createMastraInstance(':memory:')
      const runtime = new AssistantRuntimeService({
        mastra,
        assistantsRepo: {} as AssistantsRepository,
        providersRepo: {} as ProvidersRepository,
        threadsRepo: {} as ThreadsRepository,
        webSearchSettingsRepo: {
          getDefaultEngine: vi.fn(async () => 'bing')
        } as unknown as WebSearchSettingsRepository,
        mcpServersRepo: {
          getSettings: vi.fn(async () => ({ mcpServers: {} }))
        } as never,
        channelEventBus: new ChannelEventBus()
      })

      await (
        runtime as unknown as {
          ensureAgentRegistered: (
            assistant: AppAssistant,
            provider: AppProvider,
            options?: {
              channelDeliveryEnabled: boolean
            }
          ) => Promise<void>
        }
      ).ensureAgentRegistered(assistant, buildProvider(), {
        channelDeliveryEnabled: true
      })

      const agent = mastra.getAgentById(assistant.id)
      const tools = await agent.listTools()

      expect(Object.keys(tools)).toEqual(
        expect.arrayContaining([
          'webFetch',
          'readSoulMemory',
          'updateSoulMemory',
          'listWorkLogs',
          'readWorkLog',
          'searchWorkLogs',
          'sendMessageToChannel',
          'sendImage',
          'sendFile'
        ])
      )
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('does not register work-log tools for assistants without workspaces', async () => {
    const assistant = buildAssistant({
      workspaceConfig: {}
    })
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {} as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      channelEventBus: new ChannelEventBus()
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(assistant, buildProvider())

    const agent = mastra.getAgentById(assistant.id)
    const tools = await agent.listTools()

    expect(Object.keys(tools)).not.toEqual(
      expect.arrayContaining(['listWorkLogs', 'readWorkLog', 'searchWorkLogs'])
    )
  })

  it('registers the assistant workspace context processor alongside attachment uploads', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-runtime-'))

    try {
      const assistant = buildAssistant({
        workspaceConfig: {
          rootPath: workspaceRoot
        }
      })
      const mastra = await createMastraInstance(':memory:')
      const runtime = new AssistantRuntimeService({
        mastra,
        assistantsRepo: {} as AssistantsRepository,
        providersRepo: {} as ProvidersRepository,
        threadsRepo: {} as ThreadsRepository,
        webSearchSettingsRepo: {
          getDefaultEngine: vi.fn(async () => 'bing')
        } as unknown as WebSearchSettingsRepository,
        mcpServersRepo: {
          getSettings: vi.fn(async () => ({ mcpServers: {} }))
        } as never,
        channelEventBus: new ChannelEventBus()
      })

      await (
        runtime as unknown as {
          ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
        }
      ).ensureAgentRegistered(assistant, buildProvider())

      const agent = mastra.getAgentById(assistant.id)
      const attachmentProcessor = await agent.resolveProcessorById('attachment-uploader')
      const workspaceContextProcessor = await agent.resolveProcessorById(
        'assistant-workspace-context'
      )

      expect(attachmentProcessor?.id).toBe('attachment-uploader')
      expect(workspaceContextProcessor?.id).toBe('assistant-workspace-context')
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('uses the configured guardrail provider for detector models', async () => {
    const resolveModelSpy = vi.spyOn(modelResolver, 'resolveModel')
    const assistant = buildAssistant({
      workspaceConfig: {
        rootPath: '/tmp'
      }
    })
    const assistantProvider = buildProvider({
      id: 'assistant-provider',
      selectedModel: 'assistant-model'
    })
    const guardrailProvider = buildProvider({
      id: 'guardrail-provider',
      name: 'guardrail',
      selectedModel: 'guardrail-model'
    })
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (providerId: string) =>
          providerId === guardrailProvider.id ? guardrailProvider : null
        )
      } as unknown as ProvidersRepository,
      threadsRepo: {
        hasAnyThreads: vi.fn(async () => true)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      securitySettingsRepo: {
        getSettings: vi.fn(async () => ({
          promptInjectionEnabled: true,
          piiDetectionEnabled: true,
          guardrailProviderId: guardrailProvider.id
        }))
      },
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    try {
      await (
        runtime as unknown as {
          ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
        }
      ).ensureAgentRegistered(assistant, assistantProvider)

      expect(
        resolveModelSpy.mock.calls.some(
          ([config]) =>
            config.type === assistantProvider.type &&
            config.apiKey === assistantProvider.apiKey &&
            config.apiHost === assistantProvider.apiHost &&
            config.selectedModel === assistantProvider.selectedModel
        )
      ).toBe(true)
      expect(
        resolveModelSpy.mock.calls.some(
          ([config]) =>
            config.type === guardrailProvider.type &&
            config.apiKey === guardrailProvider.apiKey &&
            config.apiHost === guardrailProvider.apiHost &&
            config.selectedModel === guardrailProvider.selectedModel
        )
      ).toBe(true)
    } finally {
      resolveModelSpy.mockRestore()
    }
  })

  it('omits security processors when both guardrails are disabled', async () => {
    const assistant = buildAssistant({
      workspaceConfig: {
        rootPath: '/tmp'
      }
    })
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {
        hasAnyThreads: vi.fn(async () => true)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      securitySettingsRepo: {
        getSettings: vi.fn(async () => ({
          promptInjectionEnabled: false,
          piiDetectionEnabled: false,
          guardrailProviderId: null
        }))
      },
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(assistant, buildProvider())

    const agent = mastra.getAgentById(assistant.id)

    await expect(agent.resolveProcessorById('prompt-injection-detector')).resolves.toBeNull()
    await expect(agent.resolveProcessorById('pii-detector')).resolves.toBeNull()
    await expect(agent.resolveProcessorById('batch-parts')).resolves.toBeNull()
    await expect(agent.resolveProcessorById('attachment-uploader')).resolves.toMatchObject({
      id: 'attachment-uploader'
    })
  })

  it('omits security processors by default when security settings are unavailable', async () => {
    const assistant = buildAssistant({
      workspaceConfig: {
        rootPath: '/tmp'
      }
    })
    const mastra = await createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {
        hasAnyThreads: vi.fn(async () => true)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(assistant, buildProvider())

    const agent = mastra.getAgentById(assistant.id)

    await expect(agent.resolveProcessorById('prompt-injection-detector')).resolves.toBeNull()
    await expect(agent.resolveProcessorById('pii-detector')).resolves.toBeNull()
    await expect(agent.resolveProcessorById('batch-parts')).resolves.toBeNull()
    await expect(agent.resolveProcessorById('attachment-uploader')).resolves.toMatchObject({
      id: 'attachment-uploader'
    })
  })

  it('re-registers an agent when provider configuration changes', async () => {
    const assistant = buildAssistant()
    const initialProvider = buildProvider()
    const updatedProvider = {
      ...initialProvider,
      apiHost: 'https://api.alt-provider.local/v1'
    }

    const mastra = await createMastraInstance(':memory:')
    const removeAgentSpy = vi.spyOn(mastra, 'removeAgent')

    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: {} as AssistantsRepository,
      providersRepo: {} as ProvidersRepository,
      threadsRepo: {} as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    const ensureAgentRegistered = runtime as unknown as {
      ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
    }

    await ensureAgentRegistered.ensureAgentRegistered(assistant, initialProvider)
    await ensureAgentRegistered.ensureAgentRegistered(assistant, updatedProvider)

    expect(removeAgentSpy).toHaveBeenCalledWith(assistant.id)
  })

  it('passes assistant max steps into chat stream execution', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(new ReadableStream())

    const assistant = {
      ...buildAssistant(),
      maxSteps: 17
    }
    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1'
        }))
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await runtime.streamChat({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1',
      messages: []
    })

    expect(handleChatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          maxSteps: 17,
          modelSettings: {
            maxRetries: 2
          }
        })
      })
    )
  })

  it('disables OpenAI Responses storage for openai-response providers', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(new ReadableStream())

    const assistant = buildAssistant()
    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider({ type: 'openai-response' }))
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1'
        }))
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await runtime.streamChat({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1',
      messages: []
    })

    expect(handleChatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          providerOptions: {
            openai: {
              store: false
            }
          }
        })
      })
    )
  })

  it('uses thread-level provider overrides for chat execution', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(new ReadableStream())

    const resolveModelSpy = vi.spyOn(modelResolver, 'resolveModel')
    const assistant = buildAssistant({
      providerId: null
    })
    const overrideProvider = buildProvider({
      id: 'override-provider',
      type: 'anthropic',
      apiHost: 'https://anthropic.example.com',
      selectedModel: 'provider-default-model'
    })

    const providersRepo = {
      getById: vi.fn(async (providerId: string) => {
        if (providerId === overrideProvider.id) {
          return overrideProvider
        }

        return null
      })
    } as unknown as ProvidersRepository

    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          metadata: {
            providerOverride: {
              providerId: overrideProvider.id,
              model: 'claude-sonnet-4-5'
            }
          }
        }))
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    try {
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: []
      })

      expect(resolveModelSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: overrideProvider.type,
          apiKey: overrideProvider.apiKey,
          apiHost: overrideProvider.apiHost,
          selectedModel: 'claude-sonnet-4-5'
        }),
        expect.anything(),
        expect.anything()
      )
      expect(handleChatStreamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            providerOptions: buildOpenAIProviderOptions(overrideProvider)
          })
        })
      )
    } finally {
      resolveModelSpy.mockRestore()
    }
  })

  it('forwards request abort signal into mastra chat stream execution', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(new ReadableStream())

    const assistant = buildAssistant()
    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1'
        }))
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    const abortController = new AbortController()

    await runtime.streamChat({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1',
      messages: [],
      abortSignal: abortController.signal
    })

    expect(handleChatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          abortSignal: abortController.signal
        })
      })
    )
  })

  it('forwards incoming message metadata into mastra chat stream execution', async () => {
    handleChatStreamMock.mockReset()
    toAISdkV5MessagesMock.mockReset()
    handleChatStreamMock.mockResolvedValue(new ReadableStream())

    const assistant = buildAssistant()
    const message = {
      id: 'channel:channel-1:msg-1',
      content: 'hello from lark',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'hello from lark' }],
      metadata: {
        fromChannel: 'lark',
        channelId: 'channel-1',
        remoteChatId: 'oc_123',
        remoteMessageId: 'msg-1'
      }
    }
    const convertedMessages = [
      {
        id: 'channel:channel-1:msg-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'hello from lark' }],
        metadata: {
          fromChannel: 'lark',
          channelId: 'channel-1',
          remoteChatId: 'oc_123',
          remoteMessageId: 'msg-1'
        }
      }
    ]
    toAISdkV5MessagesMock.mockReturnValue(convertedMessages)

    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'default-profile'
        }))
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    await runtime.streamChat({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'default-profile',
      messages: [message]
    })

    expect(toAISdkV5MessagesMock).toHaveBeenCalledWith([message])
    expect(handleChatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          messages: convertedMessages
        })
      })
    )
  })

  it('publishes an outbound channel event after a channel-targeted reply completes', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'text-delta',
            id: 'message-1',
            delta: 'Hello'
          } as UIMessageChunk)
          controller.enqueue({
            type: 'text-delta',
            id: 'message-1',
            delta: ' world'
          } as UIMessageChunk)
          controller.enqueue({ type: 'finish' } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const bus = new ChannelEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'New Thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      channelEventBus: bus
    })

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: [],
        channelTarget: {
          channelId: 'channel-1',
          channelType: 'lark',
          remoteChatId: 'chat-1'
        }
      })
    )

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        content: 'Hello world',
        payload: {
          type: 'text',
          text: 'Hello world'
        }
      }
    ])
  })

  it('publishes completed channel chunks before the full reply finishes', async () => {
    handleChatStreamMock.mockReset()

    let streamController!: ReadableStreamDefaultController<UIMessageChunk>
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          streamController = controller
        }
      })
    )

    const assistant = buildAssistant()
    const bus = new ChannelEventBus()
    const publishedEvents: unknown[] = []
    let resolveFirstEvent = () => {}
    const firstEventSeen = new Promise<void>((resolve) => {
      resolveFirstEvent = resolve
    })

    bus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
      if (publishedEvents.length === 1) {
        resolveFirstEvent()
      }
    })

    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'New Thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      channelEventBus: bus
    })

    const stream = await runtime.streamChat({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1',
      messages: [],
      channelTarget: {
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1'
      }
    })

    const drainPromise = drainStream(stream)

    streamController.enqueue({
      type: 'text-delta',
      id: 'message-1',
      delta: 'First'
    } as UIMessageChunk)
    streamController.enqueue({
      type: 'text-delta',
      id: 'message-1',
      delta: ' chunk[[BR]]Sec'
    } as UIMessageChunk)

    await firstEventSeen

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        content: 'First chunk',
        payload: {
          type: 'text',
          text: 'First chunk'
        }
      }
    ])

    streamController.enqueue({
      type: 'text-delta',
      id: 'message-1',
      delta: 'ond chunk'
    } as UIMessageChunk)
    streamController.enqueue({ type: 'finish' } as UIMessageChunk)
    streamController.close()

    await drainPromise

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        content: 'First chunk',
        payload: {
          type: 'text',
          text: 'First chunk'
        }
      },
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        content: 'Second chunk',
        payload: {
          type: 'text',
          text: 'Second chunk'
        }
      }
    ])
  })

  it('does not publish an outbound channel event when reply text is empty', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'finish' } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const bus = new ChannelEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    const runtime = new AssistantRuntimeService({
      mastra: await createMastraInstance(':memory:'),
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'New Thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      channelEventBus: bus
    })

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: [],
        channelTarget: {
          channelId: 'channel-1',
          channelType: 'lark',
          remoteChatId: 'chat-1'
        }
      })
    )

    expect(publishedEvents).toEqual([])
  })

  it('records usage for chat streams with the persisted assistant message id', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'start',
            messageId: 'assistant-msg-1'
          } as UIMessageChunk)
          controller.enqueue({ type: 'finish-step' } as UIMessageChunk)
          controller.enqueue({ type: 'finish-step' } as UIMessageChunk)
          controller.enqueue({
            type: 'finish',
            totalUsage: {
              inputTokens: 120,
              outputTokens: 40,
              totalTokens: 160,
              reasoningTokens: 12,
              cachedInputTokens: 30
            },
            finishReason: 'stop'
          } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const recordMessageUsage = vi.fn(async () => undefined)
    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => null
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'Usage thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      threadUsageRepo: {
        recordMessageUsage
      },
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: []
      })
    )

    expect(recordMessageUsage).toHaveBeenCalledWith({
      messageId: 'assistant-msg-1',
      threadId: 'thread-1',
      assistantId: assistant.id,
      resourceId: 'profile-1',
      providerId: 'provider-1',
      model: 'gpt-4.1',
      source: 'chat',
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
        reasoningTokens: 12,
        cachedInputTokens: 30
      },
      stepCount: 2,
      finishReason: 'stop',
      createdAt: expect.any(String)
    })
  })

  it('records usage when the AI SDK finish chunk carries usage in message metadata', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockImplementation(async (options: unknown) => {
      const messageMetadata = (
        options as {
          messageMetadata?: (input: { part: Record<string, unknown> }) => unknown
        }
      ).messageMetadata

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'start',
            messageId: 'assistant-msg-v6'
          } as UIMessageChunk)
          controller.enqueue({
            type: 'finish',
            messageMetadata: messageMetadata?.({
              part: {
                type: 'finish',
                totalUsage: {
                  inputTokens: 88,
                  outputTokens: 22,
                  totalTokens: 110,
                  reasoningTokens: 7,
                  cachedInputTokens: 11
                }
              }
            }),
            finishReason: 'stop'
          } as UIMessageChunk)
          controller.close()
        }
      })
    })

    const assistant = buildAssistant()
    const recordMessageUsage = vi.fn(async () => undefined)
    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => null
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'Usage metadata thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      threadUsageRepo: {
        recordMessageUsage
      },
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: []
      })
    )

    expect(recordMessageUsage).toHaveBeenCalledWith({
      messageId: 'assistant-msg-v6',
      threadId: 'thread-1',
      assistantId: assistant.id,
      resourceId: 'profile-1',
      providerId: 'provider-1',
      model: 'gpt-4.1',
      source: 'chat',
      usage: {
        inputTokens: 88,
        outputTokens: 22,
        totalTokens: 110,
        reasoningTokens: 7,
        cachedInputTokens: 11
      },
      stepCount: 0,
      finishReason: 'stop',
      createdAt: expect.any(String)
    })
  })

  it('does not record usage when a streamed chat is aborted', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'start',
            messageId: 'assistant-msg-aborted'
          } as UIMessageChunk)
          controller.enqueue({
            type: 'finish',
            totalUsage: {
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15
            }
          } as UIMessageChunk)
        }
      })
    )

    const assistant = buildAssistant()
    const recordMessageUsage = vi.fn(async () => undefined)
    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => null
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'Abort thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      threadUsageRepo: {
        recordMessageUsage
      },
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    const stream = await runtime.streamChat({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1',
      messages: []
    })

    await stream.cancel()

    expect(recordMessageUsage).not.toHaveBeenCalled()
  })

  it('does not record usage when a background stream errors', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'start',
            messageId: 'assistant-msg-error'
          } as UIMessageChunk)
          controller.error(new Error('stream failed'))
        }
      })
    )

    const assistant = buildAssistant()
    const recordMessageUsage = vi.fn(async () => undefined)
    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => null
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'Error thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }))
      } as unknown as ThreadsRepository,
      threadUsageRepo: {
        recordMessageUsage
      },
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    await expect(
      drainStream(
        await runtime.streamChat({
          assistantId: assistant.id,
          threadId: 'thread-1',
          profileId: 'profile-1',
          messages: []
        })
      )
    ).rejects.toThrow('stream failed')

    expect(recordMessageUsage).not.toHaveBeenCalled()
  })

  it('touches thread lastMessageAt after streaming completes', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const touchLastMessageAt = vi.fn(async () => undefined)

    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => null
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'Sprint retro',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        touchLastMessageAt
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: []
      })
    )

    expect(touchLastMessageAt).toHaveBeenCalledWith('thread-1', expect.any(String))
  })

  it('syncs generated thread titles back into app threads after streaming', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' } as UIMessageChunk)
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const updateTitle = vi.fn(async () => ({
      id: 'thread-1',
      assistantId: assistant.id,
      resourceId: 'profile-1',
      title: 'Release plan checklist',
      lastMessageAt: null,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }))
    const appendMessagesUpdated = vi.fn()

    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => ({
          getStore: async () => ({
            getThreadById: async () => ({
              id: 'thread-1',
              title: 'Release plan checklist',
              resourceId: 'profile-1',
              createdAt: new Date('2026-03-02T00:00:00.000Z'),
              updatedAt: new Date('2026-03-02T00:00:00.000Z')
            })
          })
        })
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'New Thread',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        updateTitle,
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      threadMessageEventsStore: {
        appendMessagesUpdated
      }
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: []
      })
    )

    expect(updateTitle).toHaveBeenCalledWith('thread-1', 'Release plan checklist')
    expect(appendMessagesUpdated).toHaveBeenCalledWith({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1',
      source: 'command'
    })
  })

  it('does not overwrite custom app thread titles when mastra generates one', async () => {
    handleChatStreamMock.mockReset()
    handleChatStreamMock.mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close()
        }
      })
    )

    const assistant = buildAssistant()
    const updateTitle = vi.fn()

    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => ({
          getStore: async () => ({
            getThreadById: async () => ({
              id: 'thread-1',
              title: 'Release plan checklist',
              resourceId: 'profile-1',
              createdAt: new Date('2026-03-02T00:00:00.000Z'),
              updatedAt: new Date('2026-03-02T00:00:00.000Z')
            })
          })
        })
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => buildProvider())
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: 'Sprint retro',
          lastMessageAt: null,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        })),
        updateTitle,
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as ThreadsRepository,
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing'),
        getKeepBrowserWindowOpen: vi.fn(async () => false)
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })
    ;(
      runtime as unknown as {
        ensureAgentRegistered: () => Promise<void>
      }
    ).ensureAgentRegistered = vi.fn(async () => undefined)

    await drainStream(
      await runtime.streamChat({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        messages: []
      })
    )

    expect(updateTitle).not.toHaveBeenCalled()
  })

  it('archives a compacted thread into the assistant workspace before clearing memory', async () => {
    generateTextMock.mockReset()
    generateTextMock.mockResolvedValue({
      text: '## Goal\n\nWrap up investigation.\n\n## Key Outcomes\n\n- Found the root cause.\n'
    })

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-thread-command-'))
    const assistant = buildAssistant({
      workspaceConfig: {
        rootPath: workspaceRoot
      }
    })
    const provider = buildProvider({
      name: 'OpenAI',
      selectedModel: 'gpt-5'
    })
    const persistedMessages = [
      {
        id: 'persisted-user-1',
        role: 'user',
        content: {
          parts: [
            {
              type: 'text',
              text: 'Please investigate the webhook bug.'
            }
          ]
        }
      },
      {
        id: 'persisted-assistant-1',
        role: 'assistant',
        content: {
          parts: [
            {
              type: 'text',
              text: 'The issue is caused by a missing signature header.'
            }
          ]
        }
      }
    ]

    toAISdkV5MessagesMock.mockReset()
    toAISdkV5MessagesMock.mockReturnValue([
      {
        id: 'user-msg-1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Please investigate the webhook bug.'
          }
        ]
      },
      {
        id: 'assistant-msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'The issue is caused by a missing signature header.'
          }
        ]
      }
    ])

    const listMessages = vi.fn(async () => ({
      messages: persistedMessages
    }))
    const deleteThread = vi.fn(async () => undefined)
    const getThreadById = vi.fn(async () => ({
      title: 'Webhook bug investigation'
    }))
    const appendMessagesUpdated = vi.fn()

    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => ({
          getStore: async () => ({
            listMessages,
            deleteThread,
            getThreadById
          })
        })
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async () => provider)
      } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1',
          title: '',
          metadata: {},
          lastMessageAt: null,
          createdAt: '2026-03-14T00:00:00.000Z',
          updatedAt: '2026-03-14T00:00:00.000Z'
        }))
      } as unknown as ThreadsRepository,
      threadMessageEventsStore: {
        appendMessagesUpdated
      },
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    try {
      const result = await runtime.runThreadCommand({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        command: 'new'
      })

      expect(result.command).toBe('new')
      expect(result.archiveFileName).toMatch(/^thread_history_\d{4}-\d{2}-\d{2}\.md$/)
      expect(result.archiveFilePath).toContain(workspaceRoot)
      expect(result.threadTitle).toBe('Webhook bug investigation')
      await expect(readFile(result.archiveFilePath, 'utf8')).resolves.toContain('## Summary')
      await expect(readFile(result.archiveFilePath, 'utf8')).resolves.toContain(
        'missing signature header'
      )
      await expect(readFile(path.join(workspaceRoot, 'MEMORY.md'), 'utf8')).resolves.toContain(
        'User compacted thread memory of Webhook bug investigation'
      )
      expect(deleteThread).toHaveBeenCalledWith({ threadId: 'thread-1' })
      expect(appendMessagesUpdated).toHaveBeenCalledWith({
        assistantId: assistant.id,
        threadId: 'thread-1',
        profileId: 'profile-1',
        source: 'command'
      })
      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 2,
          providerOptions: undefined,
          temperature: 0
        })
      )
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('enriches assistant chat history with persisted usage and excludes non-chat roles', async () => {
    toAISdkV5MessagesMock.mockReset()
    const assistant = buildAssistant()
    const persistedMessages = [
      {
        id: 'db-assistant-msg-1',
        role: 'assistant',
        content: {
          parts: [
            {
              type: 'reasoning',
              details: [
                {
                  type: 'reasoning.summary',
                  text: 'Think through options'
                }
              ]
            },
            {
              type: 'text',
              text: 'Final answer'
            }
          ]
        }
      },
      {
        id: 'db-user-msg-1',
        role: 'user',
        content: {
          parts: [
            {
              type: 'text',
              text: 'Question'
            }
          ]
        }
      }
    ]

    toAISdkV5MessagesMock.mockReturnValue([
      {
        id: 'assistant-msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: 'Think through options'
          },
          {
            type: 'text',
            text: 'Final answer'
          }
        ],
        metadata: { persisted: true }
      },
      {
        id: 'user-msg-1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Question'
          }
        ]
      },
      {
        id: 'system-msg-1',
        role: 'system',
        parts: [
          {
            type: 'text',
            text: 'System note'
          }
        ]
      }
    ])

    const listMessages = vi.fn(async () => ({
      messages: persistedMessages
    }))
    const listByMessageIds = vi.fn(async () => ({
      'assistant-msg-1': {
        inputTokens: 140,
        outputTokens: 32,
        totalTokens: 172,
        reasoningTokens: 15,
        cachedInputTokens: 24
      }
    }))

    const runtime = new AssistantRuntimeService({
      mastra: {
        getStorage: () => ({
          getStore: async () => ({
            listMessages
          })
        })
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => assistant)
      } as unknown as AssistantsRepository,
      providersRepo: { getById: vi.fn() } as unknown as ProvidersRepository,
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: assistant.id,
          resourceId: 'profile-1'
        }))
      } as unknown as ThreadsRepository,
      threadUsageRepo: {
        recordMessageUsage: vi.fn(async () => undefined),
        listByMessageIds
      },
      webSearchSettingsRepo: {
        getDefaultEngine: vi.fn(async () => 'bing')
      } as unknown as WebSearchSettingsRepository,
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    const messages = await runtime.listThreadMessages({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1'
    })

    expect(toAISdkV5MessagesMock).toHaveBeenCalledWith(persistedMessages)
    expect(listByMessageIds).toHaveBeenCalledWith(['assistant-msg-1', 'user-msg-1', 'system-msg-1'])
    expect(messages).toEqual([
      {
        id: 'assistant-msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: 'Think through options'
          },
          {
            type: 'text',
            text: 'Final answer'
          }
        ],
        metadata: {
          persisted: true,
          usage: {
            inputTokens: 140,
            outputTokens: 32,
            totalTokens: 172,
            reasoningTokens: 15,
            cachedInputTokens: 24
          }
        }
      },
      {
        id: 'user-msg-1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Question'
          }
        ]
      }
    ])
  })
})

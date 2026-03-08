import os from 'node:os'
import path from 'node:path'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { Mastra } from '@mastra/core/mastra'
import type { UIMessageChunk } from 'ai'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { AppProvider } from '../persistence/repos/providers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import { ChannelEventBus } from '../channels/channel-event-bus'
import { AssistantRuntimeService } from './assistant-runtime'
import { createMastraInstance } from './store'

const { handleChatStreamMock, toAISdkV5MessagesMock } = vi.hoisted(() => ({
  handleChatStreamMock: vi.fn(),
  toAISdkV5MessagesMock: vi.fn()
}))

vi.mock('@mastra/ai-sdk', () => ({
  handleChatStream: (options: unknown) => handleChatStreamMock(options)
}))

vi.mock('@mastra/ai-sdk/ui', () => ({
  toAISdkV5Messages: (messages: unknown) => toAISdkV5MessagesMock(messages)
}))

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

describe('AssistantRuntimeService', () => {
  it('includes global and workspace skills directories by default', () => {
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

    expect(skillsPaths).toEqual(
      expect.arrayContaining([
        path.join(os.homedir(), '.claude', 'skills'),
        path.join(os.homedir(), '.agent', 'skills'),
        path.join(workspaceRoot, 'skills')
      ])
    )
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
      await expect(access(path.join(workspaceRoot, 'HEARTBEAT.md'))).resolves.toBeUndefined()
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
          ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
        }
      ).ensureAgentRegistered(assistant, buildProvider())

      const agent = mastra.getAgentById(assistant.id)
      const tools = await agent.listTools()

      expect(Object.keys(tools)).toEqual(
        expect.arrayContaining([
          'browserSearch',
          'readSoulMemory',
          'updateSoulMemory',
          'sendMessageToChannel',
          'sendImage',
          'sendFile'
        ])
      )
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
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
          maxSteps: 17
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

    expect(updateTitle).toHaveBeenCalledWith('thread-1', 'Release plan checklist')
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

  it('uses toAISdkV5Messages for chat history and excludes non-chat roles', async () => {
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
      }
    ])
  })
})

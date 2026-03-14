import path from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Mastra } from '@mastra/core/mastra'
import type { UIMessage, UIMessageChunk } from 'ai'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { AppProvider } from '../persistence/repos/providers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { TeamThreadsRepository } from '../persistence/repos/team-threads-repo'
import type { TeamWorkspacesRepository } from '../persistence/repos/team-workspaces-repo'
import { TeamRunStatusStore } from '../server/chat/team-run-status-store'
import { TeamRuntimeService } from './team-runtime'

const {
  agentConfigs,
  agentStreamMock,
  localFilesystemOptions,
  toAISdkStreamMock,
  toAISdkV5MessagesMock,
  workspaceInitMock
} = vi.hoisted(() => ({
  agentConfigs: [] as Record<string, unknown>[],
  agentStreamMock: vi.fn(),
  localFilesystemOptions: [] as Record<string, unknown>[],
  toAISdkStreamMock: vi.fn(),
  toAISdkV5MessagesMock: vi.fn(),
  workspaceInitMock: vi.fn(async () => undefined)
}))

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    private readonly config: Record<string, unknown>

    constructor(config: Record<string, unknown>) {
      this.config = config
      agentConfigs.push(config)
    }

    async stream(messages: unknown, options: Record<string, unknown>) {
      return agentStreamMock(this.config, messages, options)
    }
  }
}))

vi.mock('@mastra/core/workspace', () => ({
  LocalFilesystem: class {
    constructor(options: Record<string, unknown>) {
      localFilesystemOptions.push(options)
    }
  },
  LocalSandbox: class {
    constructor(options: Record<string, unknown>) {
      void options
    }
  },
  Workspace: class {
    constructor(options: Record<string, unknown>) {
      void options
    }

    init() {
      return workspaceInitMock()
    }
  }
}))

vi.mock('@mastra/ai-sdk', () => ({
  toAISdkStream: (stream: unknown, options: unknown) => toAISdkStreamMock(stream, options)
}))

vi.mock('@mastra/ai-sdk/ui', () => ({
  toAISdkV5Messages: (messages: unknown) => toAISdkV5MessagesMock(messages)
}))

vi.mock('@mastra/memory', () => ({
  Memory: class {
    constructor(options: Record<string, unknown>) {
      void options
    }
  }
}))

vi.mock('./model-resolver', () => ({
  resolveModel: vi.fn(() => ({ id: 'mock-model' }))
}))

function buildAssistant(overrides?: Partial<AppAssistant>): AppAssistant {
  return {
    id: 'assistant-1',
    name: 'Researcher',
    description: 'Finds facts, sources, and supporting evidence.',
    instructions: 'Research the problem.',
    enabled: true,
    providerId: 'provider-member',
    workspaceConfig: {
      rootPath: '/assistant/workspace'
    },
    skillsConfig: {},
    mcpConfig: {},
    maxSteps: 20,
    memoryConfig: null,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z',
    ...overrides
  }
}

function buildProvider(overrides?: Partial<AppProvider>): AppProvider {
  return {
    id: 'provider-member',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-5',
    providerModels: null,
    enabled: true,
    supportsVision: false,
    isBuiltIn: false,
    icon: null,
    officialSite: null,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z',
    ...overrides
  }
}

function buildTeamWorkspace(
  overrides?: Partial<{
    id: string
    name: string
    rootPath: string
    teamDescription: string
    supervisorProviderId: string | null
    supervisorModel: string
    createdAt: string
    updatedAt: string
  }>
) {
  return {
    id: 'workspace-1',
    name: 'Team Workspace',
    rootPath: '/team/workspace',
    teamDescription: 'Coordinate release',
    supervisorProviderId: 'provider-supervisor',
    supervisorModel: 'gpt-5',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z',
    ...overrides
  }
}

function buildTeamThread(
  overrides?: Partial<{
    id: string
    workspaceId: string
    resourceId: string
    title: string
    teamDescription: string
    supervisorProviderId: string | null
    supervisorModel: string
    lastMessageAt: string | null
    createdAt: string
    updatedAt: string
  }>
) {
  return {
    id: 'team-thread-1',
    workspaceId: 'workspace-1',
    resourceId: 'default-profile',
    title: 'Release team',
    teamDescription: 'Legacy thread description',
    supervisorProviderId: null,
    supervisorModel: '',
    lastMessageAt: null,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z',
    ...overrides
  }
}

function buildWorkspaceMember(
  assistantId: string,
  overrides?: Partial<{
    workspaceId: string
    sortOrder: number
    createdAt: string
  }>
) {
  return {
    workspaceId: 'workspace-1',
    assistantId,
    sortOrder: 0,
    createdAt: '2026-03-07T00:00:00.000Z',
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

function createMastraStream(chunks: unknown[] = []) {
  return {
    fullStream: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      }
    })
  }
}

describe('TeamRuntimeService', () => {
  beforeEach(() => {
    agentConfigs.length = 0
    localFilesystemOptions.length = 0
    agentStreamMock.mockReset()
    toAISdkStreamMock.mockReset()
    toAISdkV5MessagesMock.mockReset()
    workspaceInitMock.mockClear()

    agentStreamMock.mockImplementation(async (config, _messages, options) => {
      const onIterationComplete = options['onIterationComplete'] as
        | ((context: Record<string, unknown>) => Promise<void> | void)
        | undefined
      const configId = String(config['id'] ?? '')

      if (configId.startsWith('team-supervisor:')) {
        await onIterationComplete?.({
          iteration: 1,
          text: 'synthesized answer'
        })

        return createMastraStream()
      }

      return createMastraStream([{ type: 'text-delta', payload: { text: 'member result' } }])
    })

    toAISdkStreamMock.mockImplementation(
      () =>
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: 'start' } as UIMessageChunk)
            controller.close()
          }
        })
    )
  })

  it('overrides member workspaces with the team workspace root path', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) =>
          id === 'provider-supervisor'
            ? buildProvider({ id, selectedModel: 'gpt-5' })
            : buildProvider({ id })
        )
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await drainStream(
      (
        await runtime.streamTeamChat({
          threadId: 'team-thread-1',
          profileId: 'default-profile',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'ship it' }] }]
        })
      ).stream
    )

    expect(localFilesystemOptions.length).toBeGreaterThan(0)
    expect(
      localFilesystemOptions.every((value) => value.basePath === path.resolve('/team/workspace'))
    ).toBe(true)
  })

  it('resolves only live assistant members into the supervisor agent', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async (assistantId: string) =>
          assistantId === 'assistant-live' ? buildAssistant({ id: 'assistant-live' }) : null
        )
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [
          buildWorkspaceMember('assistant-live', { sortOrder: 0 }),
          buildWorkspaceMember('assistant-missing', { sortOrder: 1 })
        ])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    const supervisorConfig = agentConfigs.at(-1) as { tools?: Record<string, unknown> } | undefined
    expect(supervisorConfig?.tools).toBeDefined()
    expect(Object.keys(supervisorConfig?.tools ?? {})).toEqual([
      'delegate_to_researcher_1',
      'complete'
    ])
  })

  it('passes assistant descriptions into team routing context', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () =>
          buildAssistant({
            description: 'Investigates bugs, facts, and source material.'
          })
        )
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    const memberConfig = agentConfigs.find((config) => config.id === 'assistant-1') as
      | { description?: string }
      | undefined
    const supervisorConfig = agentConfigs.at(-1) as { instructions?: string } | undefined

    expect(memberConfig?.description).toBe('Investigates bugs, facts, and source material.')
    expect(supervisorConfig?.instructions).toContain(
      '- Researcher: Investigates bugs, facts, and source material.'
    )
    expect(supervisorConfig?.instructions).toContain(
      'delegate again instead of asking the user whether another round is needed'
    )
    expect(supervisorConfig?.instructions).toContain(
      'Never produce a raw assistant reply to the user'
    )
    expect(supervisorConfig?.instructions).toContain(
      'When the work is done, call complete instead of replying in natural language'
    )
  })

  it('requires supervisor tool usage on each team turn', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    expect(agentStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'team-supervisor:team-thread-1'
      }),
      [],
      expect.objectContaining({
        toolChoice: 'required'
      })
    )
  })

  it('exposes a complete tool for ending the supervisor turn without raw text', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    const supervisorConfig = agentConfigs.at(-1) as
      | {
          tools?: Record<
            string,
            {
              execute?: (
                input: Record<string, unknown>,
                context: Record<string, unknown>
              ) => Promise<unknown>
            }
          >
        }
      | undefined
    const result = await supervisorConfig?.tools?.complete?.execute?.(
      {
        summary: 'The delegated work is complete.'
      },
      {
        requestContext: new Map<string, unknown>()
      }
    )

    expect(result).toEqual({
      kind: 'team-complete',
      status: 'complete',
      summary: 'The delegated work is complete.'
    })
  })

  it('stops iterating once the supervisor calls complete', async () => {
    agentStreamMock.mockImplementation(async (config, _messages, options) => {
      const configId = String(config['id'] ?? '')

      if (configId.startsWith('team-supervisor:')) {
        const onIterationComplete = options['onIterationComplete'] as
          | ((context: Record<string, unknown>) => Promise<unknown>)
          | undefined
        const decision = await onIterationComplete?.({
          iteration: 1,
          text: '',
          toolCalls: [
            {
              id: 'tool-complete-1',
              name: 'complete',
              args: {}
            }
          ],
          toolResults: [],
          finishReason: 'tool-calls',
          isFinal: false,
          runId: 'run-1',
          agentId: 'team-supervisor:team-thread-1',
          agentName: 'Team Supervisor',
          messages: []
        })

        expect(decision).toEqual({
          continue: false
        })

        return createMastraStream()
      }

      return createMastraStream([{ type: 'text-delta', payload: { text: 'member result' } }])
    })

    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await drainStream(
      (
        await runtime.streamTeamChat({
          threadId: 'team-thread-1',
          profileId: 'default-profile',
          messages: []
        })
      ).stream
    )
  })

  it('disables OpenAI Responses storage for openai-response supervisors', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) =>
          id === 'provider-supervisor'
            ? buildProvider({ id, type: 'openai-response' })
            : buildProvider({ id })
        )
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    expect(agentStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'team-supervisor:team-thread-1'
      }),
      [],
      expect.objectContaining({
        providerOptions: {
          openai: {
            store: false
          }
        }
      })
    )
  })

  it('rejects invalid team thread configuration', async () => {
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await expect(
      runtime.streamTeamChat({
        threadId: 'team-thread-1',
        profileId: 'default-profile',
        messages: []
      })
    ).rejects.toMatchObject({
      code: 'team_not_ready'
    })
  })

  it('emits status events during delegation', async () => {
    agentStreamMock.mockImplementation(async (config, _messages, options) => {
      const onIterationComplete = options['onIterationComplete'] as
        | ((context: Record<string, unknown>) => Promise<void> | void)
        | undefined
      const configId = String(config['id'] ?? '')

      if (configId.startsWith('team-supervisor:')) {
        const tools = (config['tools'] ?? {}) as Record<
          string,
          {
            execute?: (
              input: Record<string, unknown>,
              context: Record<string, unknown>
            ) => Promise<unknown>
          }
        >
        const firstTool = Object.values(tools)[0]
        await firstTool?.execute?.(
          {
            task: 'delegate the research'
          },
          {
            requestContext: new Map<string, unknown>()
          }
        )
        await onIterationComplete?.({
          iteration: 1,
          text: 'synthesized answer'
        })

        return createMastraStream()
      }

      return createMastraStream([{ type: 'text-delta', payload: { text: 'member result' } }])
    })

    const statusStore = new TeamRunStatusStore()
    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore
    })

    const { runId, stream } = await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })
    await drainStream(stream)

    expect(statusStore.getEvents(runId).map((event) => event.type)).toEqual([
      'run-started',
      'delegation-started',
      'delegation-finished',
      'iteration-complete',
      'run-finished'
    ])
    expect(statusStore.getEvents(runId)[1]?.data).toMatchObject({
      primitiveId: 'assistant-1',
      primitiveType: 'tool',
      assistantName: 'Researcher'
    })
  })

  it('returns mention-based routing hints from member tools', async () => {
    agentStreamMock.mockImplementation(async (config) => {
      const configId = String(config['id'] ?? '')

      if (configId === 'assistant-1') {
        return createMastraStream([
          {
            type: 'text-delta',
            payload: {
              text: 'I verified the facts. @Planner should turn this into the rollout plan.'
            }
          }
        ])
      }

      return createMastraStream()
    })

    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async (assistantId: string) => {
          if (assistantId === 'assistant-2') {
            return buildAssistant({
              id: 'assistant-2',
              name: 'Planner',
              description: 'Turns research into execution plans.'
            })
          }

          return buildAssistant()
        })
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [
          buildWorkspaceMember('assistant-1', { sortOrder: 0 }),
          buildWorkspaceMember('assistant-2', { sortOrder: 1 })
        ])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    const supervisorConfig = agentConfigs.at(-1) as
      | {
          tools?: Record<
            string,
            {
              execute?: (
                input: Record<string, unknown>,
                context: Record<string, unknown>
              ) => Promise<unknown>
            }
          >
        }
      | undefined
    const tool = supervisorConfig?.tools?.delegate_to_researcher_1
    const result = await tool?.execute?.(
      {
        task: 'check the factual risks'
      },
      {
        requestContext: new Map<string, unknown>()
      }
    )

    expect(result).toMatchObject({
      kind: 'team-member-result',
      assistantId: 'assistant-1',
      assistantName: 'Researcher',
      mentions: ['assistant-2'],
      mentionNames: ['Planner']
    })
  })

  it('pipes delegated member stream chunks into the tool writer', async () => {
    const delegatedChunks = [
      {
        type: 'text-delta',
        payload: {
          text: 'Partial '
        }
      },
      {
        type: 'text-delta',
        payload: {
          text: 'member update'
        }
      }
    ]

    agentStreamMock.mockImplementation(async (config) => {
      const configId = String(config['id'] ?? '')

      if (configId === 'assistant-1') {
        return createMastraStream(delegatedChunks)
      }

      return createMastraStream()
    })

    const runtime = new TeamRuntimeService({
      mastra: { getStorage: () => null } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    const supervisorConfig = agentConfigs.at(-1) as
      | {
          tools?: Record<
            string,
            {
              execute?: (
                input: Record<string, unknown>,
                context: Record<string, unknown>
              ) => Promise<unknown>
            }
          >
        }
      | undefined
    const tool = supervisorConfig?.tools?.delegate_to_researcher_1
    const streamedChunks: unknown[] = []
    const writer = new WritableStream<unknown>({
      write(chunk) {
        streamedChunks.push(chunk)
      }
    })

    const result = await tool?.execute?.(
      {
        task: 'share your current findings'
      },
      {
        requestContext: new Map<string, unknown>(),
        writer
      }
    )

    expect(streamedChunks).toEqual(delegatedChunks)
    expect(result).toMatchObject({
      kind: 'team-member-result',
      text: 'Partial member update'
    })
  })

  it('lists team thread history from persisted Mastra memory', async () => {
    const listMessages = vi.fn(async () => ({
      messages: [
        {
          id: 'msg-user',
          role: 'user',
          createdAt: new Date('2026-03-07T00:00:00.000Z'),
          threadId: 'team-thread-1',
          resourceId: 'default-profile',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Hello team' }]
          }
        }
      ]
    }))
    const uiMessages: UIMessage[] = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello team' }]
      }
    ]
    toAISdkV5MessagesMock.mockReturnValue(uiMessages)

    const runtime = new TeamRuntimeService({
      mastra: {
        getStorage: () => ({
          getStore: async () => ({
            listMessages
          })
        })
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread()),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    const messages = await runtime.listTeamThreadMessages({
      threadId: 'team-thread-1',
      profileId: 'default-profile'
    })

    expect(listMessages).toHaveBeenCalledWith({
      threadId: 'team-thread-1',
      resourceId: 'default-profile',
      perPage: false
    })
    expect(messages).toEqual(uiMessages)
  })

  it('syncs generated team thread titles from Mastra memory after streaming', async () => {
    const getThreadById = vi.fn(async () => ({
      title: 'Plan release checklist'
    }))
    const updateTitle = vi.fn(async () => buildTeamThread({ title: 'Plan release checklist' }))

    const runtime = new TeamRuntimeService({
      mastra: {
        getStorage: () => ({
          getStore: async () => ({
            getThreadById
          })
        })
      } as unknown as Mastra,
      assistantsRepo: {
        getById: vi.fn(async () => buildAssistant())
      } as unknown as AssistantsRepository,
      providersRepo: {
        getById: vi.fn(async (id: string) => buildProvider({ id }))
      } as unknown as ProvidersRepository,
      teamWorkspacesRepo: {
        getById: vi.fn(async () => buildTeamWorkspace()),
        listMembers: vi.fn(async () => [buildWorkspaceMember('assistant-1')])
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => buildTeamThread({ title: '' })),
        touchLastMessageAt: vi.fn(async () => undefined),
        updateTitle
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await drainStream(
      (
        await runtime.streamTeamChat({
          threadId: 'team-thread-1',
          profileId: 'default-profile',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Plan release' }] }]
        })
      ).stream
    )

    expect(getThreadById).toHaveBeenCalledWith({
      threadId: 'team-thread-1'
    })
    expect(updateTitle).toHaveBeenCalledWith('team-thread-1', 'Plan release checklist')
  })
})

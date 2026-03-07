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
    constructor(config: Record<string, unknown>) {
      agentConfigs.push(config)
    }

    async stream(messages: unknown, options: Record<string, unknown>) {
      return agentStreamMock(messages, options)
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
    constructor(_options: Record<string, unknown>) {}
  },
  Workspace: class {
    constructor(_options: Record<string, unknown>) {}

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
    constructor(_options: Record<string, unknown>) {}
  }
}))

vi.mock('./model-resolver', () => ({
  resolveModel: vi.fn(() => ({ id: 'mock-model' }))
}))

function buildAssistant(overrides?: Partial<AppAssistant>): AppAssistant {
  return {
    id: 'assistant-1',
    name: 'Researcher',
    instructions: 'Research the problem.',
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

describe('TeamRuntimeService', () => {
  beforeEach(() => {
    agentConfigs.length = 0
    localFilesystemOptions.length = 0
    agentStreamMock.mockReset()
    toAISdkStreamMock.mockReset()
    toAISdkV5MessagesMock.mockReset()
    workspaceInitMock.mockClear()

    agentStreamMock.mockImplementation(async (_messages, options) => {
      const delegation = options['delegation'] as
        | {
            onDelegationStart?: (context: Record<string, unknown>) => Promise<void> | void
            onDelegationComplete?: (context: Record<string, unknown>) => Promise<void> | void
          }
        | undefined
      const onIterationComplete = options['onIterationComplete'] as
        | ((context: Record<string, unknown>) => Promise<void> | void)
        | undefined
      const runId = options['runId'] as string

      await delegation?.onDelegationStart?.({
        primitiveId: 'assistant-1',
        primitiveType: 'agent',
        prompt: 'delegate',
        params: {},
        iteration: 1,
        runId,
        threadId: 'team-thread-1',
        resourceId: 'default-profile',
        parentAgentId: 'team-supervisor:team-thread-1',
        parentAgentName: 'Team Supervisor',
        toolCallId: 'tool-1',
        messages: []
      })
      await delegation?.onDelegationComplete?.({
        primitiveId: 'assistant-1',
        primitiveType: 'agent',
        prompt: 'delegate',
        result: {
          text: 'member result'
        },
        iteration: 1,
        runId,
        threadId: 'team-thread-1',
        resourceId: 'default-profile',
        parentAgentId: 'team-supervisor:team-thread-1',
        parentAgentName: 'Team Supervisor',
        toolCallId: 'tool-1',
        bail: vi.fn()
      })
      await onIterationComplete?.({
        iteration: 1,
        text: 'synthesized answer'
      })

      return new ReadableStream({
        start(controller) {
          controller.close()
        }
      })
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
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          name: 'Team Workspace',
          rootPath: '/team/workspace',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }))
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => ({
          id: 'team-thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release team',
          teamDescription: 'Coordinate release',
          supervisorProviderId: 'provider-supervisor',
          supervisorModel: 'gpt-5',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        })),
        listMembers: vi.fn(async () => [
          {
            teamThreadId: 'team-thread-1',
            assistantId: 'assistant-1',
            sortOrder: 0,
            createdAt: '2026-03-07T00:00:00.000Z'
          }
        ]),
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
    expect(localFilesystemOptions.every((value) => value.basePath === '/team/workspace')).toBe(
      true
    )
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
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          name: 'Team Workspace',
          rootPath: '/team/workspace',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }))
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => ({
          id: 'team-thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release team',
          teamDescription: 'Coordinate release',
          supervisorProviderId: 'provider-supervisor',
          supervisorModel: 'gpt-5',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        })),
        listMembers: vi.fn(async () => [
          {
            teamThreadId: 'team-thread-1',
            assistantId: 'assistant-live',
            sortOrder: 0,
            createdAt: '2026-03-07T00:00:00.000Z'
          },
          {
            teamThreadId: 'team-thread-1',
            assistantId: 'assistant-missing',
            sortOrder: 1,
            createdAt: '2026-03-07T00:00:00.000Z'
          }
        ]),
        touchLastMessageAt: vi.fn(async () => undefined)
      } as unknown as TeamThreadsRepository,
      statusStore: new TeamRunStatusStore()
    })

    await runtime.streamTeamChat({
      threadId: 'team-thread-1',
      profileId: 'default-profile',
      messages: []
    })

    const supervisorConfig = agentConfigs.at(-1) as { agents?: Record<string, unknown> } | undefined
    expect(supervisorConfig?.agents).toBeDefined()
    expect(Object.keys(supervisorConfig?.agents ?? {})).toEqual(['assistant-live'])
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
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          name: 'Team Workspace',
          rootPath: '/team/workspace',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }))
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => ({
          id: 'team-thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release team',
          teamDescription: 'Coordinate release',
          supervisorProviderId: 'provider-supervisor',
          supervisorModel: 'gpt-5',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        })),
        listMembers: vi.fn(async () => []),
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
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          name: 'Team Workspace',
          rootPath: '/team/workspace',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }))
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => ({
          id: 'team-thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release team',
          teamDescription: 'Coordinate release',
          supervisorProviderId: 'provider-supervisor',
          supervisorModel: 'gpt-5',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        })),
        listMembers: vi.fn(async () => [
          {
            teamThreadId: 'team-thread-1',
            assistantId: 'assistant-1',
            sortOrder: 0,
            createdAt: '2026-03-07T00:00:00.000Z'
          }
        ]),
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
        getById: vi.fn(async () => ({
          id: 'workspace-1',
          name: 'Team Workspace',
          rootPath: '/team/workspace',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }))
      } as unknown as TeamWorkspacesRepository,
      teamThreadsRepo: {
        getById: vi.fn(async () => ({
          id: 'team-thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release team',
          teamDescription: 'Coordinate release',
          supervisorProviderId: 'provider-supervisor',
          supervisorModel: 'gpt-5',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        })),
        listMembers: vi.fn(async () => []),
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
})

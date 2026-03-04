import { describe, expect, it } from 'vitest'
import { buildAssistantThreadBranches, evaluateAssistantReadiness } from './thread-page-helpers'
import type { AssistantRecord } from '../assistants/assistants-query'
import type { ProviderRecord } from '../settings/providers/providers-query'
import type { ThreadRecord } from './threads-query'

function createAssistant(overrides?: Partial<AssistantRecord>): AssistantRecord {
  return {
    id: 'assistant-1',
    name: 'Planner',
    instructions: '',
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/workspace/a' },
    skillsConfig: {},
    mcpConfig: {},
    maxSteps: 100,
    memoryConfig: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

function createProvider(overrides?: Partial<ProviderRecord>): ProviderRecord {
  const baseProvider: ProviderRecord = {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'secret',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-5',
    providerModels: null,
    enabled: true,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  }

  return {
    ...baseProvider,
    ...overrides,
    createdAt: overrides?.createdAt ?? baseProvider.createdAt,
    updatedAt: overrides?.updatedAt ?? baseProvider.updatedAt
  }
}

function createThread(overrides?: Partial<ThreadRecord>): ThreadRecord {
  return {
    id: 'thread-1',
    assistantId: 'assistant-1',
    resourceId: 'default-profile',
    title: 'Sprint planning',
    lastMessageAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

describe('thread page readiness gate', () => {
  it('shows checklist items and hides composer when setup is incomplete', () => {
    const readiness = evaluateAssistantReadiness({
      assistant: createAssistant({
        providerId: '',
        workspaceConfig: {}
      }),
      providers: []
    })

    expect(readiness.canChat).toBe(false)
    expect(readiness.checks.filter((check) => !check.ready).map((check) => check.id)).toEqual([
      'workspace',
      'provider',
      'model'
    ])
    expect(
      readiness.checks.filter((check) => !check.ready).every((check) => check.ctaPath === '/chat')
    ).toBe(true)
  })

  it('allows composer when workspace provider and model are configured', () => {
    const readiness = evaluateAssistantReadiness({
      assistant: createAssistant(),
      providers: [createProvider()]
    })

    expect(readiness.canChat).toBe(true)
    expect(readiness.checks.every((check) => check.ready)).toBe(true)
  })
})

describe('thread sidebar nesting', () => {
  it('nests selected assistant threads only', () => {
    const assistants = [
      createAssistant({ id: 'assistant-1', name: 'Planner' }),
      createAssistant({ id: 'assistant-2', name: 'Reviewer' })
    ]
    const threads = [
      createThread({ id: 'thread-1', assistantId: 'assistant-1', title: 'Sprint planning' }),
      createThread({ id: 'thread-2', assistantId: 'assistant-1', title: 'Retro notes' })
    ]

    const branches = buildAssistantThreadBranches({
      assistants,
      selectedAssistantId: 'assistant-1',
      threads
    })

    expect(branches).toHaveLength(2)
    expect(branches[0]).toMatchObject({
      assistantId: 'assistant-1',
      canDeleteAssistant: true,
      isSelected: true
    })
    expect(branches[0].threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2'])
    expect(branches[1]).toMatchObject({
      assistantId: 'assistant-2',
      canDeleteAssistant: true,
      isSelected: false
    })
    expect(branches[1].threads).toHaveLength(0)
  })

  it('marks built-in default assistants as non-deletable in the sidebar model', () => {
    const branches = buildAssistantThreadBranches({
      assistants: [
        createAssistant({
          id: 'assistant-default',
          name: 'Default Agent',
          mcpConfig: {
            __tiaBuiltInDefaultAgent: true
          }
        })
      ],
      selectedAssistantId: 'assistant-default',
      threads: []
    })

    expect(branches).toHaveLength(1)
    expect(branches[0]).toMatchObject({
      assistantId: 'assistant-default',
      canDeleteAssistant: false
    })
  })
})

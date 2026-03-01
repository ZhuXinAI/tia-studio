import { describe, expect, it } from 'vitest'
import { evaluateAssistantReadiness } from './pages/thread-page'
import type { AssistantRecord } from '../assistants/assistants-query'
import type { ProviderRecord } from '../settings/providers/providers-query'

function createAssistant(overrides?: Partial<AssistantRecord>): AssistantRecord {
  return {
    id: 'assistant-1',
    name: 'Planner',
    instructions: '',
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/workspace/a' },
    skillsConfig: {},
    mcpConfig: {},
    memoryConfig: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

function createProvider(overrides?: Partial<ProviderRecord>): ProviderRecord {
  return {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'secret',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-5',
    providerModels: null,
    enabled: true,
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
    expect(readiness.checks.filter((check) => !check.ready).every((check) => check.ctaPath === '/assistants'))
      .toBe(true)
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

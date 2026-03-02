import { describe, expect, it, vi } from 'vitest'
import type { Mastra } from '@mastra/core/mastra'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { AppProvider } from '../persistence/repos/providers-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import { AssistantRuntimeService } from './assistant-runtime'
import { createMastraInstance } from './store'

function buildAssistant(): AppAssistant {
  return {
    id: 'assistant-1',
    name: 'TIA',
    instructions: 'You are helpful.',
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/tmp' },
    skillsConfig: {},
    mcpConfig: {},
    memoryConfig: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z'
  }
}

function buildProvider(): AppProvider {
  return {
    id: 'provider-1',
    name: 'openai',
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-4.1',
    providerModels: null,
    enabled: true,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z'
  }
}

describe('AssistantRuntimeService', () => {
  it('registers agents with memory enabled', async () => {
    const mastra = createMastraInstance(':memory:')
    const runtime = new AssistantRuntimeService({
      mastra,
      assistantsRepo: { getById: vi.fn() } as unknown as AssistantsRepository,
      providersRepo: { getById: vi.fn() } as unknown as ProvidersRepository,
      threadsRepo: { getById: vi.fn() } as unknown as ThreadsRepository
    })

    await (
      runtime as unknown as {
        ensureAgentRegistered: (assistant: AppAssistant, provider: AppProvider) => Promise<void>
      }
    ).ensureAgentRegistered(buildAssistant(), buildProvider())

    const agent = mastra.getAgentById('assistant-1')
    expect(agent.hasOwnMemory()).toBe(true)
  })

  it('normalizes persisted thread message parts for ai sdk compatibility', async () => {
    const assistant = buildAssistant()
    const listMessages = vi.fn(async () => ({
      messages: [
        {
          id: 'assistant-msg-1',
          role: 'assistant',
          content: {
            parts: [
              {
                type: 'reasoning',
                reasoning: 'Planning answer'
              },
              {
                type: 'text',
                content: 'Hello from persisted history'
              }
            ],
            metadata: { persisted: true }
          }
        },
        {
          id: 'user-msg-1',
          role: 'user',
          content: {
            parts: [
              {
                type: 'text',
                value: 'User question'
              }
            ]
          }
        }
      ]
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
      } as unknown as ThreadsRepository
    })

    const messages = await runtime.listThreadMessages({
      assistantId: assistant.id,
      threadId: 'thread-1',
      profileId: 'profile-1'
    })

    expect(messages).toEqual([
      {
        id: 'assistant-msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: 'Planning answer'
          },
          {
            type: 'text',
            text: 'Hello from persisted history'
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
            text: 'User question'
          }
        ]
      }
    ])
  })
})

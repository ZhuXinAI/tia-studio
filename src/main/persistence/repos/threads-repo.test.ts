import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ProvidersRepository } from './providers-repo'
import { readThreadProviderOverride, ThreadsRepository } from './threads-repo'

describe('ThreadsRepository', () => {
  let db: AppDatabase
  let repo: ThreadsRepository
  let assistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ThreadsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Threads Assistant',
      providerId: provider.id
    })

    assistantId = assistant.id
  })

  afterEach(() => {
    db.close()
  })

  it('filters hidden system threads by default and includes them on demand', async () => {
    const visibleThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Visible chat'
    })
    const hiddenSystemThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Background task',
      metadata: {
        system: true,
        systemType: 'background',
        taskId: 'task-1'
      }
    })

    await expect(repo.listByAssistant(assistantId)).resolves.toEqual([
      expect.objectContaining({
        id: visibleThread.id,
        title: 'Visible chat'
      })
    ])

    await expect(repo.listByAssistant(assistantId, { includeHidden: true })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: visibleThread.id
        }),
        expect.objectContaining({
          id: hiddenSystemThread.id,
          metadata: {
            system: true,
            systemType: 'background',
            taskId: 'task-1'
          }
        })
      ])
    )
  })

  it('checks if assistant has any threads', async () => {
    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'Test Provider',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-4'
    })
    const newAssistant = await assistantsRepo.create({
      name: 'New Assistant',
      providerId: provider.id
    })

    await expect(repo.hasAnyThreads(newAssistant.id)).resolves.toBe(false)

    await repo.create({
      assistantId: newAssistant.id,
      resourceId: 'profile-default',
      title: 'First thread'
    })

    await expect(repo.hasAnyThreads(newAssistant.id)).resolves.toBe(true)
  })

  it('lists threads by workspace metadata ownership', async () => {
    await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Chats thread',
      metadata: {
        workspaceId: 'workspace-chats'
      }
    })
    await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Other workspace thread',
      metadata: {
        workspaceId: 'workspace-other'
      }
    })

    await expect(repo.listByWorkspace('workspace-chats')).resolves.toEqual([
      expect.objectContaining({
        title: 'Chats thread',
        metadata: {
          workspaceId: 'workspace-chats'
        }
      })
    ])
  })

  it('reads provider overrides from thread metadata only when complete', () => {
    expect(
      readThreadProviderOverride({
        providerOverride: {
          providerId: 'provider-2',
          model: 'gpt-5-mini'
        }
      })
    ).toEqual({
      providerId: 'provider-2',
      model: 'gpt-5-mini'
    })

    expect(
      readThreadProviderOverride({
        providerOverride: {
          providerId: 'provider-2'
        }
      })
    ).toBeNull()
  })
})

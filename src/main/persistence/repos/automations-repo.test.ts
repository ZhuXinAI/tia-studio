import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateAppSchema } from '../migrate'
import { ProvidersRepository } from './providers-repo'
import { WorkspaceRecordsRepository } from './workspace-records-repo'
import { AutomationsRepository } from './automations-repo'
import { removeTestDirectory } from '../../../test/remove-test-directory'

let directory: string | null = null

afterEach(async () => {
  if (directory) {
    await removeTestDirectory(directory)
  }
  directory = null
})

describe('AutomationsRepository', () => {
  it('persists TIA-owned schedules and their run state', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-automations-'))
    const db = await migrateAppSchema(join(directory, 'app.db'))
    const provider = await new ProvidersRepository(db).create({
      name: 'Provider',
      type: 'openai',
      apiKey: 'unused',
      selectedModel: 'gpt-5'
    })
    const workspace = await new WorkspaceRecordsRepository(db).create({
      name: 'Workspace',
      rootPath: join(directory, 'workspace')
    })
    const repository = new AutomationsRepository(db)
    const created = await repository.create({
      name: 'Daily review',
      prompt: 'Review the workspace.',
      status: 'active',
      rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
      workspaceId: workspace.id,
      providerId: provider.id,
      modelId: 'gpt-5'
    })

    expect(created.nextRunAt).not.toBeNull()
    expect(await repository.list()).toEqual([created])

    await repository.recordRun(created.id, {
      lastRunAt: '2026-07-18T01:00:00.000Z',
      nextRunAt: '2026-07-19T01:00:00.000Z',
      error: 'provider unavailable'
    })
    expect(await repository.getById(created.id)).toMatchObject({
      lastRunAt: '2026-07-18T01:00:00.000Z',
      nextRunAt: '2026-07-19T01:00:00.000Z',
      lastError: 'provider unavailable'
    })

    expect(await repository.delete(created.id)).toBe(true)
    expect(await repository.list()).toEqual([])
    await db.close()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type {
  AppAssistantHeartbeat,
  UpdateAssistantHeartbeatInput
} from '../persistence/repos/assistant-heartbeats-repo'
import type {
  AppAssistantHeartbeatRun,
  CreateAssistantHeartbeatRunInput
} from '../persistence/repos/assistant-heartbeat-runs-repo'
import { HeartbeatSchedulerService } from './heartbeat-scheduler-service'

type MutableHeartbeat = AppAssistantHeartbeat
type MutableHeartbeatRun = AppAssistantHeartbeatRun

function mergeDefined<T extends object>(base: T, overrides?: Partial<T>): T {
  if (!overrides) {
    return { ...base }
  }

  return Object.entries(overrides).reduce<T>((result, [key, value]) => {
    if (value !== undefined) {
      Object.assign(result, { [key]: value })
    }
    return result
  }, { ...base })
}

function createHeartbeat(overrides?: Partial<MutableHeartbeat>): MutableHeartbeat {
  return mergeDefined(
    {
      id: 'heartbeat-1',
      assistantId: 'assistant-1',
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review recent work and conversations.',
      threadId: 'thread-heartbeat-1',
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      lastError: null,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z'
    },
    overrides
  )
}

function createAssistant(overrides?: Partial<AppAssistant>): AppAssistant {
  return mergeDefined(
    {
      id: 'assistant-1',
      name: 'TIA',
      description: 'Handles general assistant requests.',
      instructions: 'You are helpful.',
      providerId: 'provider-1',
      enabled: true,
      workspaceConfig: { rootPath: '/tmp/workspace-a' },
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    },
    overrides
  )
}

class InMemoryAssistantHeartbeatsRepo {
  constructor(private readonly heartbeats: MutableHeartbeat[]) {}

  async list(): Promise<AppAssistantHeartbeat[]> {
    return this.heartbeats.map((heartbeat) => ({ ...heartbeat }))
  }

  async getById(id: string): Promise<AppAssistantHeartbeat | null> {
    const heartbeat = this.heartbeats.find((candidate) => candidate.id === id)
    return heartbeat ? { ...heartbeat } : null
  }

  async update(
    id: string,
    input: UpdateAssistantHeartbeatInput
  ): Promise<AppAssistantHeartbeat | null> {
    const heartbeat = this.heartbeats.find((candidate) => candidate.id === id)
    if (!heartbeat) {
      return null
    }

    Object.assign(heartbeat, input)
    heartbeat.updatedAt = new Date().toISOString()
    return { ...heartbeat }
  }
}

class InMemoryAssistantHeartbeatRunsRepo {
  readonly runs: MutableHeartbeatRun[] = []

  async create(input: CreateAssistantHeartbeatRunInput): Promise<AppAssistantHeartbeatRun> {
    const run: MutableHeartbeatRun = {
      id: `heartbeat-run-${this.runs.length + 1}`,
      heartbeatId: input.heartbeatId,
      status: input.status,
      scheduledFor: input.scheduledFor,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
      outputText: input.outputText ?? input.output ?? null,
      error: input.error ?? null,
      workLogPath: input.workLogPath ?? null,
      createdAt: new Date().toISOString()
    }

    this.runs.unshift(run)
    return { ...run }
  }

  async listByHeartbeatId(heartbeatId: string): Promise<AppAssistantHeartbeatRun[]> {
    return this.runs
      .filter((run) => run.heartbeatId === heartbeatId)
      .map((run) => ({ ...run }))
  }
}

describe('HeartbeatSchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads enabled heartbeats on start and restores timers after reload', async () => {
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))

    const heartbeats = [
      createHeartbeat({
        id: 'heartbeat-1',
        intervalMinutes: 30
      }),
      createHeartbeat({
        id: 'heartbeat-2',
        assistantId: 'assistant-2',
        enabled: false,
        nextRunAt: '2026-03-10T00:10:00.000Z'
      })
    ]
    const repo = new InMemoryAssistantHeartbeatsRepo(heartbeats)
    const scheduler = new HeartbeatSchedulerService({
      heartbeatsRepo: repo,
      runHeartbeat: vi.fn(async () => ({ outputText: 'Checked recent work.' }))
    })

    await scheduler.start()

    expect((await repo.getById('heartbeat-1'))?.nextRunAt).toBe('2026-03-10T00:30:00.000Z')
    expect((await repo.getById('heartbeat-2'))?.nextRunAt).toBeNull()

    await repo.update('heartbeat-1', { intervalMinutes: 45 })
    await scheduler.reload()

    expect((await repo.getById('heartbeat-1'))?.nextRunAt).toBe('2026-03-10T00:45:00.000Z')

    await scheduler.stop()
  })

  it('skips disabled assistants and assistants without workspace roots', async () => {
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))

    const heartbeats = [
      createHeartbeat({
        id: 'heartbeat-disabled-assistant'
      }),
      createHeartbeat({
        id: 'heartbeat-missing-workspace',
        assistantId: 'assistant-2'
      })
    ]
    const repo = new InMemoryAssistantHeartbeatsRepo(heartbeats)
    const runHeartbeat = vi.fn(async () => ({ outputText: 'Checked recent work.' }))
    const scheduler = new HeartbeatSchedulerService({
      heartbeatsRepo: repo,
      assistantsRepo: {
        getById: vi.fn(async (assistantId: string) => {
          if (assistantId === 'assistant-2') {
            return createAssistant({
              id: 'assistant-2',
              workspaceConfig: {}
            })
          }

          return createAssistant({
            id: assistantId,
            enabled: false
          })
        })
      },
      runHeartbeat
    })

    await scheduler.start()

    expect((await repo.getById('heartbeat-disabled-assistant'))?.nextRunAt).toBeNull()
    expect((await repo.getById('heartbeat-missing-workspace'))?.nextRunAt).toBeNull()
    expect((await repo.getById('heartbeat-missing-workspace'))?.lastError).toBe(
      'Assistant workspace is required for heartbeat'
    )

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(runHeartbeat).not.toHaveBeenCalled()

    await scheduler.stop()
  })

  it('prevents overlapping execution for the same heartbeat', async () => {
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))

    const repo = new InMemoryAssistantHeartbeatsRepo([
      createHeartbeat({
        intervalMinutes: 1
      })
    ])
    let resolveRun!: () => void
    const runHeartbeat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve
        })
    )
    const scheduler = new HeartbeatSchedulerService({
      heartbeatsRepo: repo,
      runHeartbeat
    })

    await scheduler.start()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(runHeartbeat).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(runHeartbeat).toHaveBeenCalledTimes(1)

    resolveRun()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(runHeartbeat).toHaveBeenCalledTimes(2)

    await scheduler.stop()
  })

  it('records successful runs and updates scheduler state fields', async () => {
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))

    const repo = new InMemoryAssistantHeartbeatsRepo([
      createHeartbeat({
        intervalMinutes: 1
      })
    ])
    const runsRepo = new InMemoryAssistantHeartbeatRunsRepo()
    const writeWorkLog = vi.fn(async () => '/tmp/workspace-a/.tia/work-logs/2026-03-10.md')
    const scheduler = new HeartbeatSchedulerService({
      heartbeatsRepo: repo,
      heartbeatRunsRepo: runsRepo,
      assistantsRepo: {
        getById: vi.fn(async () => createAssistant())
      },
      runHeartbeat: vi.fn(async () => ({
        outputText: 'Checked recent work.'
      })),
      writeWorkLog
    })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(repo.getById('heartbeat-1')).resolves.toMatchObject({
      lastRunAt: '2026-03-10T00:01:00.000Z',
      nextRunAt: '2026-03-10T00:02:00.000Z',
      lastRunStatus: 'success',
      lastError: null
    })
    await expect(runsRepo.listByHeartbeatId('heartbeat-1')).resolves.toEqual([
      expect.objectContaining({
        status: 'success',
        scheduledFor: '2026-03-10T00:01:00.000Z',
        outputText: 'Checked recent work.',
        workLogPath: '/tmp/workspace-a/.tia/work-logs/2026-03-10.md'
      })
    ])
    expect(writeWorkLog).toHaveBeenCalledWith({
      workspaceRootPath: '/tmp/workspace-a',
      assistantName: 'TIA',
      outputText: 'Checked recent work.',
      occurredAt: new Date('2026-03-10T00:01:00.000Z')
    })

    await scheduler.stop()
  })

  it('records failed runs and still reschedules the next interval', async () => {
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))

    const repo = new InMemoryAssistantHeartbeatsRepo([
      createHeartbeat({
        intervalMinutes: 1
      })
    ])
    const runsRepo = new InMemoryAssistantHeartbeatRunsRepo()
    const scheduler = new HeartbeatSchedulerService({
      heartbeatsRepo: repo,
      heartbeatRunsRepo: runsRepo,
      assistantsRepo: {
        getById: vi.fn(async () => createAssistant())
      },
      runHeartbeat: vi.fn(async () => {
        throw new Error('Provider timed out')
      })
    })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(repo.getById('heartbeat-1')).resolves.toMatchObject({
      lastRunAt: '2026-03-10T00:01:00.000Z',
      nextRunAt: '2026-03-10T00:02:00.000Z',
      lastRunStatus: 'failed',
      lastError: 'Provider timed out'
    })
    await expect(runsRepo.listByHeartbeatId('heartbeat-1')).resolves.toEqual([
      expect.objectContaining({
        status: 'failed',
        scheduledFor: '2026-03-10T00:01:00.000Z',
        error: {
          message: 'Provider timed out',
          name: 'Error'
        },
        workLogPath: null
      })
    ])

    await scheduler.stop()
  })

  it('repairs the heartbeat thread before executing when the stored thread is missing', async () => {
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))

    const repo = new InMemoryAssistantHeartbeatsRepo([
      createHeartbeat({
        intervalMinutes: 1,
        threadId: null
      })
    ])
    const ensureHeartbeatThread = vi.fn(async () => ({
      id: 'thread-repaired'
    }))
    const runHeartbeat = vi.fn(async () => ({
      outputText: 'Checked recent work.'
    }))
    const scheduler = new HeartbeatSchedulerService({
      heartbeatsRepo: repo,
      ensureHeartbeatThread,
      runHeartbeat
    })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(ensureHeartbeatThread).toHaveBeenCalledWith('assistant-1', 'heartbeat-1')
    await expect(repo.getById('heartbeat-1')).resolves.toMatchObject({
      threadId: 'thread-repaired'
    })
    expect(runHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'heartbeat-1',
        threadId: 'thread-repaired'
      })
    )

    await scheduler.stop()
  })
})

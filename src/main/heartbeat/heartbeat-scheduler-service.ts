import { appendWorkLogEntry } from '../cron/work-log-writer'
import type { CreateAssistantHeartbeatRunInput } from '../persistence/repos/assistant-heartbeat-runs-repo'
import type {
  AppAssistantHeartbeat,
  UpdateAssistantHeartbeatInput
} from '../persistence/repos/assistant-heartbeats-repo'
import { logger } from '../utils/logger'

type HeartbeatExecutionResult = {
  outputText?: string | null
} | void

type HeartbeatRunner = (
  heartbeat: AppAssistantHeartbeat
) => Promise<HeartbeatExecutionResult> | HeartbeatExecutionResult

type AssistantHeartbeatsRepositoryLike = {
  list(): Promise<AppAssistantHeartbeat[]>
  getById(id: string): Promise<AppAssistantHeartbeat | null>
  update(id: string, input: UpdateAssistantHeartbeatInput): Promise<AppAssistantHeartbeat | null>
}

type AssistantHeartbeatRunsRepositoryLike = {
  create(input: CreateAssistantHeartbeatRunInput): Promise<unknown>
}

type AssistantsRepositoryLike = {
  getById(id: string): Promise<{
    name: string
    enabled?: boolean
    workspaceConfig: Record<string, unknown>
  } | null>
}

type HeartbeatSchedulerServiceOptions = {
  heartbeatsRepo: AssistantHeartbeatsRepositoryLike
  heartbeatRunsRepo?: AssistantHeartbeatRunsRepositoryLike
  assistantsRepo?: AssistantsRepositoryLike
  runHeartbeat?: HeartbeatRunner
  ensureHeartbeatThread?: (assistantId: string, heartbeatId: string) => Promise<{ id: string }>
  writeWorkLog?: typeof appendWorkLogEntry
  debugMode?: boolean
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : 'Unknown error'
  }
}

export class HeartbeatSchedulerService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly runningHeartbeats = new Set<string>()
  private started = false

  constructor(private readonly options: HeartbeatSchedulerServiceOptions) {}

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    logger.info('[HeartbeatScheduler] Starting heartbeat scheduler', {
      debugMode: this.options.debugMode
    })
    this.started = true
    await this.reload()

    // Trigger all enabled heartbeats once on startup
    const heartbeats = await this.options.heartbeatsRepo.list()
    for (const heartbeat of heartbeats) {
      const assistantState = await this.getAssistantState(heartbeat.assistantId)
      if (heartbeat.enabled && assistantState.enabled) {
        logger.info('[HeartbeatScheduler] Triggering initial heartbeat on startup', {
          heartbeatId: heartbeat.id,
          assistantId: heartbeat.assistantId
        })
        // Execute immediately without waiting
        void this.executeHeartbeat(heartbeat.id, new Date().toISOString()).catch((error) => {
          logger.error('[HeartbeatScheduler] Initial heartbeat execution failed', {
            heartbeatId: heartbeat.id,
            error
          })
        })
      }
    }
  }

  async stop(): Promise<void> {
    this.started = false
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  async reload(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()

    const heartbeats = await this.options.heartbeatsRepo.list()
    logger.debug('[HeartbeatScheduler] Reloading heartbeats', {
      count: heartbeats.length,
      heartbeats: heartbeats.map((h) => ({
        id: h.id,
        assistantId: h.assistantId,
        enabled: h.enabled,
        intervalMinutes: h.intervalMinutes
      }))
    })
    for (const heartbeat of heartbeats) {
      await this.syncHeartbeat(heartbeat)
    }
  }

  private async getAssistantState(assistantId: string): Promise<{
    assistantName: string | null
    workspaceRootPath: string | null
    enabled: boolean
    errorMessage: string | null
  }> {
    if (!this.options.assistantsRepo) {
      logger.debug('[HeartbeatScheduler] No assistantsRepo provided, allowing heartbeat', {
        assistantId
      })
      return {
        assistantName: null,
        workspaceRootPath: null,
        enabled: true,
        errorMessage: null
      }
    }

    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      logger.debug('[HeartbeatScheduler] Assistant not found', { assistantId })
      return {
        assistantName: null,
        workspaceRootPath: null,
        enabled: false,
        errorMessage: 'Assistant not found'
      }
    }

    if (assistant.enabled === false) {
      logger.debug('[HeartbeatScheduler] Assistant disabled', {
        assistantId,
        assistantName: assistant.name
      })
      return {
        assistantName: assistant.name,
        workspaceRootPath: null,
        enabled: false,
        errorMessage: null
      }
    }

    const workspaceRootPath = toNonEmptyString(assistant.workspaceConfig.rootPath)
    logger.debug('[HeartbeatScheduler] Assistant state checked', {
      assistantId,
      assistantName: assistant.name,
      workspaceRootPath,
      e: assistant.enabled
    })

    return {
      assistantName: assistant.name,
      workspaceRootPath: workspaceRootPath || null,
      enabled: true,
      errorMessage: null
    }
  }

  private async syncHeartbeat(heartbeat: AppAssistantHeartbeat): Promise<void> {
    const assistantState = await this.getAssistantState(heartbeat.assistantId)

    if (!heartbeat.enabled || !assistantState.enabled) {
      logger.debug('[HeartbeatScheduler] Heartbeat disabled or assistant disabled', {
        heartbeatId: heartbeat.id,
        heartbeatEnabled: heartbeat.enabled,
        assistantEnabled: assistantState.enabled,
        errorMessage: assistantState.errorMessage
      })
      const updateInput: UpdateAssistantHeartbeatInput = { nextRunAt: null }
      if (assistantState.errorMessage !== null) {
        updateInput.lastError = assistantState.errorMessage
      }

      await this.options.heartbeatsRepo.update(heartbeat.id, updateInput)
      return
    }

    // Only check workspace when assistantsRepo is provided (production mode)
    if (this.options.assistantsRepo && !assistantState.workspaceRootPath) {
      logger.debug('[HeartbeatScheduler] Assistant workspace is required for heartbeat', {
        heartbeatId: heartbeat.id,
        assistantId: heartbeat.assistantId
      })
      await this.options.heartbeatsRepo.update(heartbeat.id, {
        nextRunAt: null,
        lastError: 'Assistant workspace is required for heartbeat'
      })
      return
    }

    if (this.runningHeartbeats.has(heartbeat.id)) {
      logger.debug('[HeartbeatScheduler] Heartbeat already running', {
        heartbeatId: heartbeat.id
      })
      return
    }

    // Use debug interval (2 minutes) if debugMode is enabled, otherwise use configured interval
    const intervalMinutes = this.options.debugMode ? 2 : heartbeat.intervalMinutes
    const nextRunAt = new Date(Date.now() + intervalMinutes * 60_000)

    logger.debug('[HeartbeatScheduler] Scheduling heartbeat', {
      heartbeatId: heartbeat.id,
      assistantId: heartbeat.assistantId,
      intervalMinutes,
      debugMode: this.options.debugMode,
      nextRunAt: nextRunAt.toISOString()
    })

    await this.options.heartbeatsRepo.update(heartbeat.id, {
      nextRunAt: nextRunAt.toISOString()
    })

    if (!this.started) {
      return
    }

    const delay = Math.max(0, nextRunAt.getTime() - Date.now())
    const timer = setTimeout(async () => {
      this.timers.delete(heartbeat.id)
      await this.executeHeartbeat(heartbeat.id, nextRunAt.toISOString()).catch(() => undefined)
    }, delay)

    this.timers.set(heartbeat.id, timer)
  }

  private async executeHeartbeat(heartbeatId: string, scheduledFor: string): Promise<void> {
    logger.debug('[HeartbeatScheduler] Executing heartbeat', {
      heartbeatId,
      scheduledFor
    })

    if (!this.started || this.runningHeartbeats.has(heartbeatId)) {
      logger.debug('[HeartbeatScheduler] Skipping heartbeat execution', {
        heartbeatId,
        started: this.started,
        alreadyRunning: this.runningHeartbeats.has(heartbeatId)
      })
      return
    }

    const heartbeat = await this.options.heartbeatsRepo.getById(heartbeatId)
    if (!heartbeat) {
      logger.debug('[HeartbeatScheduler] Heartbeat not found', { heartbeatId })
      return
    }

    const assistantState = await this.getAssistantState(heartbeat.assistantId)
    if (!heartbeat.enabled || !assistantState.enabled) {
      logger.debug('[HeartbeatScheduler] Heartbeat or assistant disabled during execution', {
        heartbeatId,
        heartbeatEnabled: heartbeat.enabled,
        assistantEnabled: assistantState.enabled
      })
      const updateInput: UpdateAssistantHeartbeatInput = { nextRunAt: null }
      if (assistantState.errorMessage !== null) {
        updateInput.lastError = assistantState.errorMessage
      }

      await this.options.heartbeatsRepo.update(heartbeatId, updateInput)
      return
    }

    if (!this.options.runHeartbeat) {
      logger.debug('[HeartbeatScheduler] No runHeartbeat function provided', { heartbeatId })
      await this.syncHeartbeat(heartbeat)
      return
    }

    logger.debug('[HeartbeatScheduler] Starting heartbeat execution', {
      heartbeatId,
      assistantId: heartbeat.assistantId
    })
    this.runningHeartbeats.add(heartbeatId)

    const startedAt = new Date().toISOString()
    let status: 'success' | 'failed' = 'success'
    let outputText: string | null = null
    let errorPayload: Record<string, unknown> | null = null
    let workLogPath: string | null = null

    try {
      let heartbeatToRun = heartbeat
      if (this.options.ensureHeartbeatThread) {
        const thread = await this.options.ensureHeartbeatThread(heartbeat.assistantId, heartbeatId)
        if (thread.id !== heartbeat.threadId) {
          await this.options.heartbeatsRepo.update(heartbeatId, {
            threadId: thread.id
          })
          heartbeatToRun = {
            ...heartbeat,
            threadId: thread.id
          }
        }
      }

      logger.debug('[HeartbeatScheduler] Calling runHeartbeat', {
        heartbeatId,
        assistantId: heartbeatToRun.assistantId,
        threadId: heartbeatToRun.threadId
      })

      const result = await this.options.runHeartbeat(heartbeatToRun)

      logger.debug('[HeartbeatScheduler] runHeartbeat returned', {
        heartbeatId,
        result,
        resultType: typeof result,
        hasOutputText: result && typeof result === 'object' && 'outputText' in result
      })

      outputText = toNonEmptyString(result && typeof result === 'object' ? result.outputText : null)

      logger.debug('[HeartbeatScheduler] Heartbeat execution completed', {
        heartbeatId,
        hasOutput: !!outputText,
        outputLength: outputText?.length,
        outputPreview: outputText?.substring(0, 100)
      })

      if (assistantState.assistantName && assistantState.workspaceRootPath && outputText) {
        const writeWorkLog = this.options.writeWorkLog ?? appendWorkLogEntry
        workLogPath = await writeWorkLog({
          workspaceRootPath: assistantState.workspaceRootPath,
          assistantName: assistantState.assistantName,
          outputText,
          occurredAt: new Date(scheduledFor)
        })
        logger.debug('[HeartbeatScheduler] Work log written', {
          heartbeatId,
          workLogPath
        })
      }
    } catch (error) {
      status = 'failed'
      errorPayload = serializeError(error)
      logger.error('[HeartbeatScheduler] Heartbeat execution failed', {
        heartbeatId,
        error: errorPayload
      })
    } finally {
      this.runningHeartbeats.delete(heartbeatId)

      const now = new Date()
      const intervalMinutes = this.options.debugMode ? 2 : heartbeat.intervalMinutes
      const nextRunAt = new Date(now.getTime() + intervalMinutes * 60_000).toISOString()
      const finishedAt = now.toISOString()

      logger.debug('[HeartbeatScheduler] Heartbeat execution finished', {
        heartbeatId,
        status,
        hasOutput: !!outputText,
        hasError: !!errorPayload,
        nextRunAt,
        intervalMinutes,
        debugMode: this.options.debugMode
      })

      await this.options.heartbeatsRepo.update(heartbeatId, {
        lastRunAt: scheduledFor,
        nextRunAt,
        lastRunStatus: status,
        lastError: status === 'failed' ? String(errorPayload?.message ?? 'Unknown error') : null
      })

      if (this.options.heartbeatRunsRepo) {
        logger.debug('[HeartbeatScheduler] Creating heartbeat run record', {
          heartbeatId,
          status,
          hasOutputText: !!outputText,
          hasError: !!errorPayload
        })
        await this.options.heartbeatRunsRepo.create({
          heartbeatId,
          status,
          scheduledFor,
          startedAt,
          finishedAt,
          outputText,
          error: errorPayload,
          workLogPath
        })
      }
    }

    if (!this.started) {
      return
    }

    const latestHeartbeat = await this.options.heartbeatsRepo.getById(heartbeatId)
    if (!latestHeartbeat) {
      return
    }

    await this.syncHeartbeat(latestHeartbeat)
  }
}

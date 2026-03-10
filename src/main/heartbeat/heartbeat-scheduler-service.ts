import { appendWorkLogEntry } from '../cron/work-log-writer'
import type { CreateAssistantHeartbeatRunInput } from '../persistence/repos/assistant-heartbeat-runs-repo'
import type {
  AppAssistantHeartbeat,
  UpdateAssistantHeartbeatInput
} from '../persistence/repos/assistant-heartbeats-repo'

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

function resolveNextRunAt(heartbeat: AppAssistantHeartbeat, now: Date): Date {
  return new Date(now.getTime() + heartbeat.intervalMinutes * 60_000)
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

    this.started = true
    await this.reload()
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
      return {
        assistantName: null,
        workspaceRootPath: null,
        enabled: true,
        errorMessage: null
      }
    }

    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      return {
        assistantName: null,
        workspaceRootPath: null,
        enabled: false,
        errorMessage: 'Assistant not found'
      }
    }

    if (assistant.enabled === false) {
      return {
        assistantName: assistant.name,
        workspaceRootPath: null,
        enabled: false,
        errorMessage: null
      }
    }

    const workspaceRootPath = toNonEmptyString(assistant.workspaceConfig.rootPath)
    if (!workspaceRootPath) {
      return {
        assistantName: assistant.name,
        workspaceRootPath: null,
        enabled: false,
        errorMessage: 'Assistant workspace is required for heartbeat'
      }
    }

    return {
      assistantName: assistant.name,
      workspaceRootPath,
      enabled: true,
      errorMessage: null
    }
  }

  private async syncHeartbeat(heartbeat: AppAssistantHeartbeat): Promise<void> {
    const assistantState = await this.getAssistantState(heartbeat.assistantId)

    if (!heartbeat.enabled || !assistantState.enabled) {
      const updateInput: UpdateAssistantHeartbeatInput = { nextRunAt: null }
      if (assistantState.errorMessage !== null) {
        updateInput.lastError = assistantState.errorMessage
      }

      await this.options.heartbeatsRepo.update(heartbeat.id, updateInput)
      return
    }

    if (this.runningHeartbeats.has(heartbeat.id)) {
      return
    }

    const nextRunAt = resolveNextRunAt(heartbeat, new Date())
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
    if (!this.started || this.runningHeartbeats.has(heartbeatId)) {
      return
    }

    const heartbeat = await this.options.heartbeatsRepo.getById(heartbeatId)
    if (!heartbeat) {
      return
    }

    const assistantState = await this.getAssistantState(heartbeat.assistantId)
    if (!heartbeat.enabled || !assistantState.enabled) {
      const updateInput: UpdateAssistantHeartbeatInput = { nextRunAt: null }
      if (assistantState.errorMessage !== null) {
        updateInput.lastError = assistantState.errorMessage
      }

      await this.options.heartbeatsRepo.update(heartbeatId, updateInput)
      return
    }

    if (!this.options.runHeartbeat) {
      await this.syncHeartbeat(heartbeat)
      return
    }

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

      const result = await this.options.runHeartbeat(heartbeatToRun)
      outputText = toNonEmptyString(result && typeof result === 'object' ? result.outputText : null)

      if (assistantState.assistantName && assistantState.workspaceRootPath && outputText) {
        const writeWorkLog = this.options.writeWorkLog ?? appendWorkLogEntry
        workLogPath = await writeWorkLog({
          workspaceRootPath: assistantState.workspaceRootPath,
          assistantName: assistantState.assistantName,
          outputText,
          occurredAt: new Date(scheduledFor)
        })
      }
    } catch (error) {
      status = 'failed'
      errorPayload = serializeError(error)
    } finally {
      this.runningHeartbeats.delete(heartbeatId)

      const now = new Date()
      const nextRunAt = new Date(now.getTime() + heartbeat.intervalMinutes * 60_000).toISOString()
      const finishedAt = now.toISOString()

      await this.options.heartbeatsRepo.update(heartbeatId, {
        lastRunAt: scheduledFor,
        nextRunAt,
        lastRunStatus: status,
        lastError: status === 'failed' ? String(errorPayload?.message ?? 'Unknown error') : null
      })

      if (this.options.heartbeatRunsRepo) {
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

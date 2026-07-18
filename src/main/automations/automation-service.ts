import type { AppAgentRuntime } from '../../shared/agent-runtime'
import { describeAutomationSchedule } from '../../shared/automation-schedule'
import type { TiaAutomationRecord } from '../../shared/automations'
import type { AutomationsRepository } from '../persistence/repos/automations-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { WorkspacesRepository } from '../persistence/repos/workspaces-repo'
import { logger } from '../utils/logger'

export class AutomationService {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly running = new Set<string>()

  constructor(
    private readonly options: {
      repository: AutomationsRepository
      runtime: AppAgentRuntime
      providers: ProvidersRepository
      workspaces: WorkspacesRepository
    }
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), 30_000)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async runNow(id: string): Promise<TiaAutomationRecord> {
    const automation = await this.options.repository.getById(id)
    if (!automation) throw new Error('Automation not found')
    await this.run(automation)
    const updated = await this.options.repository.getById(id)
    if (!updated) throw new Error('Automation disappeared after execution')
    return updated
  }

  private async tick(): Promise<void> {
    for (const automation of await this.options.repository.listDue()) {
      void this.run(automation)
    }
  }

  private async run(automation: TiaAutomationRecord): Promise<void> {
    if (this.running.has(automation.id)) return
    this.running.add(automation.id)
    const startedAt = new Date()
    const nextRunAt =
      automation.status === 'active'
        ? describeAutomationSchedule(automation.rrule, startedAt).nextRunAt
        : null
    try {
      const [workspace, provider] = await Promise.all([
        this.options.workspaces.getById(automation.workspaceId),
        this.options.providers.getById(automation.providerId)
      ])
      if (!workspace || workspace.isMissing) throw new Error('Automation workspace is unavailable')
      if (!provider || !provider.enabled) throw new Error('Automation provider is unavailable')
      const session = await this.options.runtime.createSession({
        workspaceId: workspace.builtInKind === 'chats' ? null : workspace.id,
        workspacePath: workspace.rootPath,
        title: automation.name,
        providerId: provider.id,
        provider: provider.type,
        modelId: automation.modelId,
        accessMode: 'standard'
      })
      const receipt = await this.options.runtime.sendMessage({
        sessionId: session.id,
        text: automation.prompt,
        behavior: 'normal'
      })
      if (!receipt.accepted) throw new Error(receipt.error ?? 'Automation prompt was rejected')
      await this.options.repository.recordRun(automation.id, {
        lastRunAt: startedAt.toISOString(),
        nextRunAt,
        sessionId: session.id
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Automation execution failed'
      await this.options.repository.recordRun(automation.id, {
        lastRunAt: startedAt.toISOString(),
        nextRunAt,
        error: message
      })
      logger.error('[AutomationService] Run failed', {
        automationId: automation.id,
        error: message
      })
    } finally {
      this.running.delete(automation.id)
    }
  }
}

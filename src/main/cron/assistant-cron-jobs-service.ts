import { isValidCronExpression } from './cron-expression'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type {
  AppCronJob,
  CronJobsRepository,
  UpdateCronJobInput
} from '../persistence/repos/cron-jobs-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'

const DEFAULT_CRON_THREAD_RESOURCE_ID = 'default-profile'

export class AssistantCronJobsServiceError extends Error {
  constructor(
    public readonly statusCode: 400 | 404,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AssistantCronJobsServiceError'
  }
}

export function isAssistantCronJobsServiceError(
  error: unknown
): error is AssistantCronJobsServiceError {
  return error instanceof AssistantCronJobsServiceError
}

type AssistantCronJobsServiceOptions = {
  cronJobsRepo: Pick<CronJobsRepository, 'list' | 'getById' | 'create' | 'update' | 'delete'>
  assistantsRepo: Pick<AssistantsRepository, 'getById'>
  threadsRepo: Pick<ThreadsRepository, 'create' | 'delete'>
  reloadScheduler?: () => Promise<void>
}

type CreateCronJobInput = {
  assistantId: string
  name: string
  prompt: string
  cronExpression: string
  enabled?: boolean
}

type UpdateCronJobOptions = UpdateCronJobInput

function hasWorkspaceRootPath(workspaceConfig: Record<string, unknown>): boolean {
  return typeof workspaceConfig.rootPath === 'string' && workspaceConfig.rootPath.trim().length > 0
}

export class AssistantCronJobsService {
  constructor(private readonly options: AssistantCronJobsServiceOptions) {}

  async listCronJobs(): Promise<AppCronJob[]> {
    return this.options.cronJobsRepo.list()
  }

  async listAssistantCronJobs(assistantId: string): Promise<AppCronJob[]> {
    const cronJobs = await this.options.cronJobsRepo.list()
    return cronJobs.filter((cronJob) => cronJob.assistantId === assistantId)
  }

  async createCronJob(input: CreateCronJobInput): Promise<AppCronJob> {
    this.assertValidCronExpression(input.cronExpression)
    await this.assertAssistantSupportsCron(input.assistantId)

    const cronJob = await this.options.cronJobsRepo.create({
      assistantId: input.assistantId,
      name: input.name,
      prompt: input.prompt,
      cronExpression: input.cronExpression,
      enabled: input.enabled
    })

    const hiddenThread = await this.options.threadsRepo.create({
      assistantId: input.assistantId,
      resourceId: DEFAULT_CRON_THREAD_RESOURCE_ID,
      title: input.name,
      metadata: {
        cron: true,
        cronJobId: cronJob.id
      }
    })

    await this.options.cronJobsRepo.update(cronJob.id, {
      threadId: hiddenThread.id
    })

    return this.reloadAndReadCronJob(cronJob.id)
  }

  async updateCronJob(cronJobId: string, input: UpdateCronJobOptions): Promise<AppCronJob> {
    if (input.cronExpression !== undefined) {
      this.assertValidCronExpression(input.cronExpression)
    }

    const existingCronJob = await this.options.cronJobsRepo.getById(cronJobId)
    if (!existingCronJob) {
      throw new AssistantCronJobsServiceError(404, 'cron_job_not_found', 'Cron job not found')
    }

    const nextAssistantId = input.assistantId ?? existingCronJob.assistantId
    await this.assertAssistantSupportsCron(nextAssistantId)

    let nextThreadId = existingCronJob.threadId
    if (input.assistantId && input.assistantId !== existingCronJob.assistantId) {
      if (existingCronJob.threadId) {
        await this.options.threadsRepo.delete(existingCronJob.threadId)
      }

      const replacementThread = await this.options.threadsRepo.create({
        assistantId: nextAssistantId,
        resourceId: DEFAULT_CRON_THREAD_RESOURCE_ID,
        title: input.name ?? existingCronJob.name,
        metadata: {
          cron: true,
          cronJobId: existingCronJob.id
        }
      })
      nextThreadId = replacementThread.id
    }

    const updatedCronJob = await this.options.cronJobsRepo.update(existingCronJob.id, {
      assistantId: nextAssistantId,
      name: input.name,
      prompt: input.prompt,
      cronExpression: input.cronExpression,
      enabled: input.enabled,
      threadId: nextThreadId
    })

    if (!updatedCronJob) {
      throw new AssistantCronJobsServiceError(404, 'cron_job_not_found', 'Cron job not found')
    }

    return this.reloadAndReadCronJob(updatedCronJob.id)
  }

  async removeCronJob(cronJobId: string): Promise<boolean> {
    const existingCronJob = await this.options.cronJobsRepo.getById(cronJobId)
    if (!existingCronJob) {
      return false
    }

    if (existingCronJob.threadId) {
      await this.options.threadsRepo.delete(existingCronJob.threadId)
    }

    await this.options.cronJobsRepo.delete(existingCronJob.id)
    await this.reloadScheduler()
    return true
  }

  async removeAssistantCronJob(assistantId: string, cronJobId: string): Promise<boolean> {
    const existingCronJob = await this.options.cronJobsRepo.getById(cronJobId)
    if (!existingCronJob || existingCronJob.assistantId !== assistantId) {
      return false
    }

    return this.removeCronJob(cronJobId)
  }

  private async assertAssistantSupportsCron(assistantId: string): Promise<void> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new AssistantCronJobsServiceError(400, 'assistant_not_found', 'Assistant not found')
    }

    if (!hasWorkspaceRootPath(assistant.workspaceConfig ?? {})) {
      throw new AssistantCronJobsServiceError(
        400,
        'assistant_workspace_required',
        'Assistant workspace is required for cron jobs'
      )
    }
  }

  private assertValidCronExpression(cronExpression: string): void {
    if (!isValidCronExpression(cronExpression)) {
      throw new AssistantCronJobsServiceError(
        400,
        'invalid_cron_expression',
        'Invalid cron expression'
      )
    }
  }

  private async reloadAndReadCronJob(cronJobId: string): Promise<AppCronJob> {
    await this.reloadScheduler()

    const latestCronJob = await this.options.cronJobsRepo.getById(cronJobId)
    if (!latestCronJob) {
      throw new AssistantCronJobsServiceError(404, 'cron_job_not_found', 'Cron job not found')
    }

    return latestCronJob
  }

  private async reloadScheduler(): Promise<void> {
    await this.options.reloadScheduler?.()
  }
}

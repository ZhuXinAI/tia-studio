import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { isValidCronExpression } from '../../cron/cron-expression'
import type { AppCronJob } from '../../persistence/repos/cron-jobs-repo'
import type { AssistantCronJobsService } from '../../cron/assistant-cron-jobs-service'
import { createNoArgToolInputSchema } from './tool-schema'

type CronToolsOptions = {
  assistantId: string
  cronJobService: Pick<
    AssistantCronJobsService,
    'createCronJob' | 'listAssistantCronJobs' | 'removeAssistantCronJob'
  >
}

const cronExpressionSchema = z
  .string()
  .min(1)
  .refine((value) => isValidCronExpression(value), {
    message: 'Invalid cron expression'
  })

const cronJobOutputSchema = z.object({
  cronJobId: z.string(),
  name: z.string(),
  prompt: z.string(),
  cronExpression: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  lastRunStatus: z.enum(['success', 'failed']).nullable(),
  lastError: z.string().nullable()
})

function formatCronJob(cronJob: AppCronJob) {
  return {
    cronJobId: cronJob.id,
    name: cronJob.name,
    prompt: cronJob.prompt,
    cronExpression: cronJob.cronExpression,
    enabled: cronJob.enabled,
    lastRunAt: cronJob.lastRunAt,
    nextRunAt: cronJob.nextRunAt,
    lastRunStatus: cronJob.lastRunStatus,
    lastError: cronJob.lastError
  }
}

export function createCronTools(options: CronToolsOptions) {
  const createCronJob = createTool({
    id: 'create-cron-job',
    description:
      'Create a recurring cron job for this assistant. Use this when the user asks for scheduled follow-ups, reminders, or periodic summaries.',
    inputSchema: z.object({
      name: z.string().min(1),
      prompt: z.string().min(1),
      cronExpression: cronExpressionSchema,
      enabled: z.boolean().default(true)
    }),
    outputSchema: cronJobOutputSchema.extend({
      message: z.string()
    }),
    execute: async ({ name, prompt, cronExpression, enabled }) => {
      const cronJob = await options.cronJobService.createCronJob({
        assistantId: options.assistantId,
        name,
        prompt,
        cronExpression,
        enabled
      })

      return {
        ...formatCronJob(cronJob),
        message: `Created cron job "${cronJob.name}".`
      }
    }
  })

  const listCronJobs = createTool({
    id: 'list-cron-jobs',
    description: 'List recurring cron jobs owned by this assistant.',
    inputSchema: createNoArgToolInputSchema(),
    outputSchema: z.object({
      jobs: z.array(cronJobOutputSchema)
    }),
    execute: async () => {
      const cronJobs = await options.cronJobService.listAssistantCronJobs(options.assistantId)
      return {
        jobs: cronJobs.map((cronJob) => formatCronJob(cronJob))
      }
    }
  })

  const removeCronJob = createTool({
    id: 'remove-cron-job',
    description: 'Remove a recurring cron job owned by this assistant by cron job id.',
    inputSchema: z.object({
      cronJobId: z.string().min(1)
    }),
    outputSchema: z.object({
      success: z.boolean(),
      cronJobId: z.string(),
      message: z.string()
    }),
    execute: async ({ cronJobId }) => {
      const success = await options.cronJobService.removeAssistantCronJob(
        options.assistantId,
        cronJobId
      )

      return {
        success,
        cronJobId,
        message: success
          ? `Removed cron job ${cronJobId}.`
          : `Cron job ${cronJobId} was not found for this assistant.`
      }
    }
  })

  return {
    createCronJob,
    listCronJobs,
    removeCronJob
  }
}

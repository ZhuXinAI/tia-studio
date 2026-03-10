import { createTool } from '@mastra/core/tools'
import type { ToolExecutionContext } from '@mastra/core/tools'
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

type ChannelExecutionContext = {
  channelId: string
  chatId: string
  userId: string
}

function getChannelExecutionContext(context: ToolExecutionContext): ChannelExecutionContext | null {
  const channelContext = context.requestContext?.get('channelContext') as
    | ChannelExecutionContext
    | undefined

  if (
    !channelContext ||
    !channelContext.channelId ||
    !channelContext.chatId ||
    !channelContext.userId
  ) {
    return null
  }

  return channelContext
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
  recurring: z.boolean(),
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
    recurring: cronJob.recurring,
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
      'Create a cron job for this assistant. Supports both recurring schedules (daily, weekly, etc.) and one-time reminders. Set recurring=false for one-time execution. IMPORTANT: The prompt should be the ACTUAL TASK to execute, NOT a request. Remove phrases like "remind me to", "remind me of", "keep me updated on" - just state the task directly. Example: User says "remind me to call John" → prompt should be "call John" or "提醒：给John打电话".',
    inputSchema: z.object({
      name: z.string().min(1),
      prompt: z
        .string()
        .min(1)
        .describe(
          'The actual task to execute when the cron job runs. Remove "remind me" phrases and state the task directly. Example: "提醒：开会了" instead of "提醒我：开会了"'
        ),
      cronExpression: cronExpressionSchema,
      enabled: z.boolean().default(true),
      recurring: z.boolean().default(true)
    }),
    outputSchema: cronJobOutputSchema.extend({
      message: z.string()
    }),
    execute: async ({ name, prompt, cronExpression, enabled, recurring }, context) => {
      const channelContext = getChannelExecutionContext(context)

      const cronJob = await options.cronJobService.createCronJob({
        assistantId: options.assistantId,
        name,
        prompt,
        cronExpression,
        enabled,
        recurring,
        channelId: channelContext?.channelId ?? null,
        remoteChatId: channelContext?.chatId ?? null
      })

      return {
        ...formatCronJob(cronJob),
        message: channelContext
          ? `Created cron job "${cronJob.name}" that will send messages to this chat.`
          : `Created cron job "${cronJob.name}".`
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

import { z } from 'zod'

export const createCronJobSchema = z.object({
  assistantId: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  cronExpression: z.string().min(1),
  enabled: z.boolean().optional(),
  recurring: z.boolean().optional()
})

export const updateCronJobSchema = z.object({
  assistantId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  cronExpression: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  recurring: z.boolean().optional()
})

import { z } from 'zod'

export const createThreadSchema = z.object({
  assistantId: z.string().min(1),
  resourceId: z.string().min(1),
  title: z.string().min(1)
})

export const updateThreadSchema = z.object({
  title: z.string().min(1)
})

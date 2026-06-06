import { z } from 'zod'

const threadProviderOverrideSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1)
})

export const createThreadSchema = z.object({
  assistantId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  providerOverride: threadProviderOverrideSchema.optional(),
  resourceId: z.string().min(1),
  title: z.string()
})

export const updateThreadSchema = z.object({
  title: z.string()
})

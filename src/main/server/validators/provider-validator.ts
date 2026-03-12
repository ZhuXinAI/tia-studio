import { z } from 'zod'

export const providerTypeSchema = z.enum([
  'openai',
  'openai-response',
  'openrouter',
  'gemini',
  'anthropic',
  'ollama'
])

export const createProviderSchema = z.object({
  name: z.string().min(1),
  type: providerTypeSchema,
  apiKey: z.string().min(1),
  apiHost: z.string().url().optional(),
  selectedModel: z.string().min(1),
  providerModels: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional(),
  supportsVision: z.boolean().optional()
})

export const updateProviderSchema = createProviderSchema.partial()

export const testProviderConnectionSchema = z.object({
  type: providerTypeSchema,
  apiKey: z.string().min(1),
  apiHost: z.string().url().optional(),
  selectedModel: z.string().min(1)
})

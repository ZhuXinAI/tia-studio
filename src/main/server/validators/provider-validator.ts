import { z } from 'zod'

export const providerTypeSchema = z.enum([
  'openai',
  'openai-response',
  'openrouter',
  'gemini',
  'anthropic',
  'ollama',
  'codex-acp',
  'claude-agent-acp'
])

function apiKeyOptionalForType(type: z.infer<typeof providerTypeSchema>): boolean {
  return type === 'ollama' || type === 'codex-acp' || type === 'claude-agent-acp'
}

function addApiKeyRequirementIssue(
  input: {
    type?: z.infer<typeof providerTypeSchema>
    apiKey?: string
  },
  context: z.RefinementCtx
): void {
  if (!input.type || input.apiKey === undefined) {
    return
  }

  if (apiKeyOptionalForType(input.type) || input.apiKey.trim().length > 0) {
    return
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['apiKey'],
    message: 'apiKey is required'
  })
}

const providerFieldsSchema = z.object({
  name: z.string().min(1),
  type: providerTypeSchema,
  apiKey: z.string(),
  apiHost: z.string().url().optional(),
  selectedModel: z.string().min(1),
  providerModels: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional(),
  supportsVision: z.boolean().optional()
})

export const createProviderSchema = providerFieldsSchema.superRefine((input, context) => {
  if (apiKeyOptionalForType(input.type) || input.apiKey.trim().length > 0) {
    return
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['apiKey'],
    message: 'apiKey is required'
  })
})

export const updateProviderSchema = providerFieldsSchema.partial().superRefine((input, context) => {
  addApiKeyRequirementIssue(input, context)
})

export const testProviderConnectionSchema = z
  .object({
    type: providerTypeSchema,
    apiKey: z.string(),
    apiHost: z.string().url().optional(),
    selectedModel: z.string().min(1)
  })
  .superRefine((input, context) => {
    if (apiKeyOptionalForType(input.type) || input.apiKey.trim().length > 0) {
      return
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['apiKey'],
      message: 'apiKey is required'
    })
  })

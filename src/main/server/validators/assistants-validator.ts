import { z } from 'zod'

const jsonObjectSchema = z.record(z.string(), z.unknown())
const booleanRecordSchema = z.record(z.string(), z.boolean())
const maxStepsSchema = z.number().int().min(1)
export const assistantOriginValues = ['tia', 'external-acp', 'built-in'] as const
const assistantOriginSchema = z.enum(assistantOriginValues)

export const createAssistantSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  enabled: z.boolean().optional(),
  origin: assistantOriginSchema.optional(),
  studioFeaturesEnabled: z.boolean().optional(),
  providerId: z.string().min(1),
  workspaceConfig: jsonObjectSchema.optional(),
  skillsConfig: jsonObjectSchema.optional(),
  mcpConfig: booleanRecordSchema.optional(),
  maxSteps: maxStepsSchema.optional(),
  memoryConfig: jsonObjectSchema.nullable().optional()
})

export const updateAssistantSchema = createAssistantSchema.partial()

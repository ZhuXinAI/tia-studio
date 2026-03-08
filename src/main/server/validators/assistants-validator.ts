import { z } from 'zod'

const jsonObjectSchema = z.record(z.unknown())
const booleanRecordSchema = z.record(z.boolean())
const maxStepsSchema = z.number().int().min(1)

export const createAssistantSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  enabled: z.boolean().optional(),
  providerId: z.string().min(1),
  workspaceConfig: jsonObjectSchema.optional(),
  skillsConfig: jsonObjectSchema.optional(),
  mcpConfig: booleanRecordSchema.optional(),
  maxSteps: maxStepsSchema.optional(),
  memoryConfig: jsonObjectSchema.nullable().optional()
})

export const updateAssistantSchema = createAssistantSchema.partial()

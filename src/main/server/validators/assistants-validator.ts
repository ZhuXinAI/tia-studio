import { z } from 'zod'

const jsonObjectSchema = z.record(z.unknown())

export const createAssistantSchema = z.object({
  name: z.string().min(1),
  instructions: z.string().optional(),
  providerId: z.string().min(1),
  workspaceConfig: jsonObjectSchema.optional(),
  skillsConfig: jsonObjectSchema.optional(),
  mcpConfig: jsonObjectSchema.optional(),
  memoryConfig: jsonObjectSchema.nullable().optional()
})

export const updateAssistantSchema = createAssistantSchema.partial()

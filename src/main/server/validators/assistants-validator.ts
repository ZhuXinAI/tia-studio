import { z } from 'zod'
import {
  ASSISTANT_CODING_APPROVAL_MODES,
  ASSISTANT_CODING_SANDBOX_MODES
} from '../../assistants/coding-config'

const jsonObjectSchema = z.record(z.string(), z.unknown())
const booleanRecordSchema = z.record(z.string(), z.boolean())
const maxStepsSchema = z.number().int().min(1)
const codingConfigSchema = z.object({
  enabled: z.boolean().optional(),
  cwd: z.string().optional(),
  addDirs: z.array(z.string()).optional(),
  skipGitRepoCheck: z.boolean().optional(),
  fullAuto: z.boolean().optional(),
  approvalMode: z.enum(ASSISTANT_CODING_APPROVAL_MODES).optional(),
  sandboxMode: z.enum(ASSISTANT_CODING_SANDBOX_MODES).optional()
})

export const createAssistantSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  enabled: z.boolean().optional(),
  providerId: z.string().min(1),
  workspaceConfig: jsonObjectSchema.optional(),
  skillsConfig: jsonObjectSchema.optional(),
  codingConfig: codingConfigSchema.optional(),
  mcpConfig: booleanRecordSchema.optional(),
  maxSteps: maxStepsSchema.optional(),
  memoryConfig: jsonObjectSchema.nullable().optional()
})

export const updateAssistantSchema = createAssistantSchema.partial()

import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

const mcpServerSchema = z
  .object({
    isActive: z.boolean(),
    name: nonEmptyString,
    type: nonEmptyString,
    command: nonEmptyString.optional(),
    args: z.array(nonEmptyString).default([]),
    env: z.record(z.string()).default({}),
    installSource: nonEmptyString.default('unknown'),
    url: z.string().url().optional()
  })
  .superRefine((value, context) => {
    const transportType = value.type.toLowerCase()

    if (transportType === 'stdio' && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'command is required when type is stdio'
      })
    }

    if (transportType !== 'stdio' && !value.url && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'url is required for non-stdio MCP servers unless command is provided'
      })
    }
  })

export const updateMcpServersSettingsSchema = z.object({
  mcpServers: z.record(mcpServerSchema)
})

import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const mcpTransportTypeSchema = z.enum(['stdio', 'http', 'sse'])

const mcpServerSchema = z
  .object({
    isActive: z.boolean(),
    name: nonEmptyString,
    type: z.string().trim().toLowerCase().pipe(mcpTransportTypeSchema),
    command: nonEmptyString.optional(),
    args: z.array(nonEmptyString).default([]),
    env: z.record(z.string(), z.string()).default({}),
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

    if (transportType !== 'stdio' && !value.url) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'url is required when type is http or sse'
      })
    }

    if (transportType !== 'stdio' && value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'command is only supported when type is stdio'
      })
    }

    if (transportType !== 'stdio' && Object.keys(value.env).length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'environment variables are only supported when type is stdio'
      })
    }
  })

export const updateMcpServersSettingsSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerSchema)
})

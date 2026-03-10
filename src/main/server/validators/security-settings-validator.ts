import { z } from 'zod'

export const updateSecuritySettingsSchema = z
  .object({
    promptInjectionEnabled: z.boolean().optional(),
    piiDetectionEnabled: z.boolean().optional(),
    guardrailProviderId: z.string().trim().min(1).nullable().optional()
  })
  .refine(
    (input) =>
      input.promptInjectionEnabled !== undefined ||
      input.piiDetectionEnabled !== undefined ||
      input.guardrailProviderId !== undefined,
    {
      message: 'At least one security setting must be provided'
    }
  )

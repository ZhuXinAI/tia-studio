import { z } from 'zod'

export const updateWebSearchSettingsSchema = z
  .object({
    keepBrowserWindowOpen: z.boolean().optional(),
    showBrowser: z.boolean().optional()
  })
  .refine(
    (input) => input.keepBrowserWindowOpen !== undefined || input.showBrowser !== undefined,
    {
      message: 'At least one browsing setting must be provided'
    }
  )

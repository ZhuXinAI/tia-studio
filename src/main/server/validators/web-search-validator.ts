import { z } from 'zod'
import { browserAutomationModes } from '../../persistence/repos/web-search-settings-repo'

export const updateWebSearchSettingsSchema = z
  .object({
    keepBrowserWindowOpen: z.boolean().optional(),
    showBrowser: z.boolean().optional(),
    showBuiltInBrowser: z.boolean().optional(),
    showTiaBrowserTool: z.boolean().optional(),
    browserAutomationMode: z.enum(browserAutomationModes).optional()
  })
  .refine(
    (input) =>
      input.keepBrowserWindowOpen !== undefined ||
      input.showBrowser !== undefined ||
      input.showBuiltInBrowser !== undefined ||
      input.showTiaBrowserTool !== undefined ||
      input.browserAutomationMode !== undefined,
    {
      message: 'At least one browsing setting must be provided'
    }
  )

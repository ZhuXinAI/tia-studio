import { z } from 'zod'
import { webSearchEngines } from '../../web-search/web-search-engine'

export const updateWebSearchSettingsSchema = z.object({
  defaultEngine: z.enum(webSearchEngines).optional(),
  keepBrowserWindowOpen: z.boolean().optional()
}).refine((input) => input.defaultEngine !== undefined || input.keepBrowserWindowOpen !== undefined, {
  message: 'At least one web search setting must be provided'
})

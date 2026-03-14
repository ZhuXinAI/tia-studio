import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { BuiltInBrowserController } from '../../built-in-browser-manager'

type BuiltInBrowserToolsOptions = {
  controller: BuiltInBrowserController
}

export function createBuiltInBrowserTools(options: BuiltInBrowserToolsOptions) {
  const requestBrowserHumanHandoff = createTool({
    id: 'request-browser-human-handoff',
    description:
      'After you have already told the user what action is needed, bring the built-in browser window to the front for manual user intervention, inject a "Done, continue" button, and wait until the user hands control back.',
    inputSchema: z.object({
      message: z.string().trim().min(1),
      buttonLabel: z.string().trim().min(1).optional(),
      timeoutSeconds: z.number().int().positive().max(3600).default(900)
    }),
    outputSchema: z.object({
      status: z.enum(['completed', 'timed_out']),
      currentUrl: z.string().nullable(),
      remoteDebuggingPort: z.number().int().positive(),
      message: z.string()
    }),
    execute: async ({ message, buttonLabel, timeoutSeconds }) => {
      const result = await options.controller.requestHumanHandoff({
        message,
        buttonLabel,
        timeoutMs: timeoutSeconds * 1000
      })

      return {
        ...result,
        message:
          result.status === 'completed'
            ? 'The user clicked "Done, continue" in the built-in browser.'
            : 'The built-in browser handoff timed out before the user clicked the continue button.'
      }
    }
  })

  return {
    requestBrowserHumanHandoff
  }
}

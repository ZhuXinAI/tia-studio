import type { AgentExecutionOptions } from '@mastra/core/agent'
import { randomUUID } from 'node:crypto'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { tiaBrowserToolLog } from '../../tia-browser-tool-logger'
import type {
  TiaBrowserToolAutomationCommand,
  TiaBrowserToolGetKind,
  TiaBrowserToolWaitLoadState
} from '../../tia-browser-tool-contract'
import type { TiaBrowserToolController } from '../../tia-browser-tool-manager'

type TiaBrowserToolToolsOptions = {
  controller: TiaBrowserToolController
}

type TiaBrowserToolDelegateToolOptions = {
  browserAgentName: string
  maxSteps?: number | null
  providerOptions?: AgentExecutionOptions['providerOptions']
}

const DEFAULT_TIA_BROWSER_TOOL_DELEGATE_TIMEOUT_MS = 5 * 60 * 1000

const tiaBrowserToolGetKinds = [
  'text',
  'html',
  'value',
  'attr',
  'title',
  'url',
  'count',
  'box',
  'styles'
] as const satisfies readonly TiaBrowserToolGetKind[]

const tiaBrowserToolWaitLoadStates = [
  'load',
  'domcontentloaded',
  'networkidle'
] as const satisfies readonly TiaBrowserToolWaitLoadState[]

const tiaBrowserToolActionInputSchema = z
  .object({
    action: z.enum([
      'open',
      'close',
      'snapshot',
      'click',
      'dblclick',
      'focus',
      'fill',
      'type',
      'press',
      'keydown',
      'keyup',
      'hover',
      'check',
      'uncheck',
      'select',
      'scroll',
      'scrollintoview',
      'drag',
      'upload',
      'get',
      'wait'
    ]),
    url: z.string().trim().min(1).optional(),
    ref: z.string().trim().min(1).optional(),
    newTab: z.boolean().optional(),
    text: z.string().optional(),
    key: z.string().trim().min(1).optional(),
    values: z.array(z.string().trim().min(1)).min(1).optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    amount: z.number().int().positive().optional(),
    sourceRef: z.string().trim().min(1).optional(),
    targetRef: z.string().trim().min(1).optional(),
    filePaths: z.array(z.string().trim().min(1)).min(1).optional(),
    kind: z.enum(tiaBrowserToolGetKinds).optional(),
    selector: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    interactive: z.boolean().optional(),
    compact: z.boolean().optional(),
    depth: z.number().int().positive().optional(),
    milliseconds: z.number().int().positive().optional(),
    urlPattern: z.string().trim().min(1).optional(),
    loadState: z.enum(tiaBrowserToolWaitLoadStates).optional(),
    expression: z.string().trim().min(1).optional(),
    timeoutSeconds: z.number().int().positive().max(3600).optional()
  })
  .superRefine((input, context) => {
    const requireField = (field: keyof typeof input, message: string) => {
      const value = input[field]
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0) ||
        (Array.isArray(value) && value.length === 0)
      ) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message
        })
      }
    }

    switch (input.action) {
      case 'open':
        requireField('url', 'Open requires a URL.')
        return
      case 'click':
      case 'dblclick':
      case 'focus':
      case 'hover':
      case 'check':
      case 'uncheck':
      case 'scrollintoview':
        requireField('ref', `${input.action} requires an element ref.`)
        return
      case 'fill':
      case 'type':
        requireField('ref', `${input.action} requires an element ref.`)
        requireField('text', `${input.action} requires text.`)
        return
      case 'press':
      case 'keydown':
      case 'keyup':
        requireField('key', `${input.action} requires a key.`)
        return
      case 'select':
        requireField('ref', 'Select requires an element ref.')
        requireField('values', 'Select requires one or more option values.')
        return
      case 'drag':
        requireField('sourceRef', 'Drag requires a source ref.')
        requireField('targetRef', 'Drag requires a target ref.')
        return
      case 'upload':
        requireField('ref', 'Upload requires an element ref.')
        requireField('filePaths', 'Upload requires one or more file paths.')
        return
      case 'get':
        requireField('kind', 'Get requires a kind.')
        if (input.kind === 'count') {
          requireField('selector', 'Get count requires a CSS selector.')
        } else if (input.kind === 'attr') {
          requireField('ref', 'Get attr requires an element ref.')
          requireField('name', 'Get attr requires an attribute name.')
        } else if (input.kind !== 'title' && input.kind !== 'url') {
          requireField('ref', `Get ${input.kind} requires an element ref.`)
        }
        return
      case 'wait':
        if (
          input.ref ||
          input.milliseconds ||
          input.text ||
          input.urlPattern ||
          input.loadState ||
          input.expression
        ) {
          return
        }

        context.addIssue({
          code: 'custom',
          path: ['action'],
          message:
            'Wait requires a ref, milliseconds, text, URL pattern, load state, or expression.'
        })
        return
    }
  })

const tiaBrowserToolActionOutputSchema = z.object({
  action: z.string(),
  currentUrl: z.string().nullable(),
  title: z.string().optional(),
  snapshot: z.string().optional(),
  text: z.string().optional(),
  value: z.string().nullable().optional(),
  attribute: z.string().nullable().optional(),
  count: z.number().int().nonnegative().optional(),
  box: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    })
    .nullable()
    .optional(),
  styles: z.record(z.string(), z.string()).optional(),
  waitedFor: z.string().optional(),
  message: z.string().optional()
})

function truncateForLog(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function resolveTiaBrowserToolDelegateTimeoutMs(): number {
  const envTimeout = Number.parseInt(process.env.TIA_BROWSER_TOOL_DELEGATE_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(envTimeout) && envTimeout > 0
    ? envTimeout
    : DEFAULT_TIA_BROWSER_TOOL_DELEGATE_TIMEOUT_MS
}

export function createTiaBrowserToolTools(options: TiaBrowserToolToolsOptions) {
  const requestBrowserHumanHandoff = createTool({
    id: 'request-browser-human-handoff',
    description:
      'After you have already told the user what action is needed, bring the tia-browser-tool window to the front for manual user intervention, inject a "Done, continue" button, and wait until the user hands control back.',
    inputSchema: z.object({
      message: z.string().trim().min(1),
      buttonLabel: z.string().trim().min(1).optional(),
      timeoutSeconds: z.number().int().positive().max(3600).default(900)
    }),
    outputSchema: z.object({
      status: z.enum(['completed', 'timed_out']),
      currentUrl: z.string().nullable(),
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
            ? 'The user clicked "Done, continue" in the tia-browser-tool window.'
            : 'The tia-browser-tool handoff timed out before the user clicked the continue button.'
      }
    }
  })

  return {
    requestBrowserHumanHandoff
  }
}

export function createTiaBrowserToolActionTools(options: TiaBrowserToolToolsOptions) {
  const tiaBrowserToolAction = createTool({
    id: 'tia-browser-tool-action',
    description:
      'Control TIA browser tool with common agent-browser-style actions such as open, snapshot, click, fill, type, get, and wait. Snapshot returns accessibility-tree output with refs like [ref=e1] that later actions can use as @e1.',
    inputSchema: tiaBrowserToolActionInputSchema,
    outputSchema: tiaBrowserToolActionOutputSchema,
    execute: async (input) => {
      const command = toTiaBrowserToolAutomationCommand(input)
      return await options.controller.runAutomationCommand(command)
    }
  })

  return {
    tiaBrowserToolAction
  }
}

export function createTiaBrowserToolDelegateTool(options: TiaBrowserToolDelegateToolOptions) {
  const useTiaBrowserTool = createTool({
    id: 'use-tia-browser-tool',
    description:
      'Delegate a browser-heavy task to the dedicated tia-browser-tool subagent. Use this for multi-step navigation, forms, snapshots, and extraction when tia-browser-tool mode is enabled.',
    inputSchema: z.object({
      task: z.string().trim().min(1)
    }),
    outputSchema: z.object({
      text: z.string(),
      subAgentThreadId: z.string(),
      subAgentResourceId: z.string()
    }),
    execute: async ({ task }, context) => {
      const timeoutMs = resolveTiaBrowserToolDelegateTimeoutMs()
      const agent = context?.mastra?.getAgent?.(options.browserAgentName)
      if (!agent) {
        tiaBrowserToolLog('TiaBrowserToolDelegate', 'browser agent lookup failed', {
          browserAgentName: options.browserAgentName
        })
        throw new Error(`TIA browser tool agent "${options.browserAgentName}" is unavailable.`)
      }

      const subAgentThreadId = `${options.browserAgentName}:${randomUUID()}`
      const subAgentResourceId = options.browserAgentName
      const startedAt = Date.now()
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null

      const run = async () => {
        tiaBrowserToolLog('TiaBrowserToolDelegate', 'starting delegated browser task', {
          browserAgentName: options.browserAgentName,
          maxSteps: options.maxSteps ?? null,
          subAgentThreadId,
          subAgentResourceId,
          taskPreview: truncateForLog(task),
          timeoutMs
        })

        const stream = await agent.stream(
          [{ role: 'user', content: task }] as never,
          {
            requestContext: context?.requestContext,
            ...(typeof options.maxSteps === 'number' ? { maxSteps: options.maxSteps } : {}),
            ...(options.providerOptions ? { providerOptions: options.providerOptions } : {}),
            memory: {
              resource: subAgentResourceId,
              thread: subAgentThreadId,
              options: {
                lastMessages: false
              }
            }
          } as never
        )

        tiaBrowserToolLog('TiaBrowserToolDelegate', 'browser subagent stream created', {
          subAgentThreadId
        })

        const textPromise = stream.text.then((text) => {
          tiaBrowserToolLog('TiaBrowserToolDelegate', 'browser subagent text resolved', {
            subAgentThreadId,
            textPreview: truncateForLog(text)
          })
          return text
        })

        if (context?.writer) {
          tiaBrowserToolLog(
            'TiaBrowserToolDelegate',
            'skipping raw browser subagent stream forwarding to avoid duplicate message ids in standard assistant threads',
            {
              subAgentThreadId
            }
          )
        }

        const text = await textPromise
        const durationMs = Date.now() - startedAt
        tiaBrowserToolLog('TiaBrowserToolDelegate', 'delegated browser task completed', {
          durationMs,
          subAgentThreadId
        })

        return {
          text,
          subAgentThreadId,
          subAgentResourceId
        }
      }

      try {
        return await Promise.race([
          run(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              const timeoutError = new Error(
                `use-tia-browser-tool timed out after ${timeoutMs}ms. Set TIA_BROWSER_TOOL_DEBUG=true to capture detailed browser delegation logs.`
              )
              tiaBrowserToolLog('TiaBrowserToolDelegate', 'delegated browser task timed out', {
                browserAgentName: options.browserAgentName,
                elapsedMs: Date.now() - startedAt,
                subAgentThreadId,
                timeoutMs
              })
              reject(timeoutError)
            }, timeoutMs)
          })
        ])
      } catch (error) {
        tiaBrowserToolLog('TiaBrowserToolDelegate', 'delegated browser task failed', {
          browserAgentName: options.browserAgentName,
          elapsedMs: Date.now() - startedAt,
          error,
          subAgentThreadId
        })
        throw error
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
      }
    }
  })

  return {
    useTiaBrowserTool
  }
}

function toTiaBrowserToolAutomationCommand(
  input: z.infer<typeof tiaBrowserToolActionInputSchema>
): TiaBrowserToolAutomationCommand {
  switch (input.action) {
    case 'open':
      return {
        action: 'open',
        url: input.url ?? ''
      }
    case 'close':
      return {
        action: 'close'
      }
    case 'snapshot':
      return {
        action: 'snapshot',
        ...(input.interactive !== undefined ? { interactive: input.interactive } : {}),
        ...(input.compact !== undefined ? { compact: input.compact } : {}),
        ...(input.depth !== undefined ? { depth: input.depth } : {}),
        ...(input.selector ? { selector: input.selector } : {})
      }
    case 'click':
      return {
        action: 'click',
        ref: input.ref ?? '',
        ...(input.newTab !== undefined ? { newTab: input.newTab } : {})
      }
    case 'dblclick':
      return {
        action: 'dblclick',
        ref: input.ref ?? ''
      }
    case 'focus':
      return {
        action: 'focus',
        ref: input.ref ?? ''
      }
    case 'fill':
      return {
        action: 'fill',
        ref: input.ref ?? '',
        text: input.text ?? ''
      }
    case 'type':
      return {
        action: 'type',
        ref: input.ref ?? '',
        text: input.text ?? ''
      }
    case 'press':
      return {
        action: 'press',
        key: input.key ?? ''
      }
    case 'keydown':
      return {
        action: 'keydown',
        key: input.key ?? ''
      }
    case 'keyup':
      return {
        action: 'keyup',
        key: input.key ?? ''
      }
    case 'hover':
      return {
        action: 'hover',
        ref: input.ref ?? ''
      }
    case 'check':
      return {
        action: 'check',
        ref: input.ref ?? ''
      }
    case 'uncheck':
      return {
        action: 'uncheck',
        ref: input.ref ?? ''
      }
    case 'select':
      return {
        action: 'select',
        ref: input.ref ?? '',
        values: input.values ?? []
      }
    case 'scroll':
      return {
        action: 'scroll',
        ...(input.direction ? { direction: input.direction } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {})
      }
    case 'scrollintoview':
      return {
        action: 'scrollintoview',
        ref: input.ref ?? ''
      }
    case 'drag':
      return {
        action: 'drag',
        sourceRef: input.sourceRef ?? '',
        targetRef: input.targetRef ?? ''
      }
    case 'upload':
      return {
        action: 'upload',
        ref: input.ref ?? '',
        filePaths: input.filePaths ?? []
      }
    case 'get':
      return {
        action: 'get',
        kind: input.kind as TiaBrowserToolGetKind,
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.selector ? { selector: input.selector } : {}),
        ...(input.name ? { name: input.name } : {})
      }
    case 'wait':
      return {
        action: 'wait',
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.milliseconds !== undefined ? { milliseconds: input.milliseconds } : {}),
        ...(input.text ? { text: input.text } : {}),
        ...(input.urlPattern ? { urlPattern: input.urlPattern } : {}),
        ...(input.loadState ? { loadState: input.loadState } : {}),
        ...(input.expression ? { expression: input.expression } : {}),
        ...(input.timeoutSeconds !== undefined ? { timeoutMs: input.timeoutSeconds * 1000 } : {})
      }
  }
}

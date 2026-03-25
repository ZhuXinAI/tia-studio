import { randomUUID } from 'node:crypto'
import type { AgentExecutionOptions } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

type CodingAgentTarget = {
  target: string
  agentName: string
  providerName: string
  providerOptions?: AgentExecutionOptions['providerOptions']
}

type CodingAgentDelegateToolOptions = {
  codingAgents: CodingAgentTarget[]
  maxSteps?: number | null
}

const DEFAULT_CODING_AGENT_DELEGATE_TIMEOUT_MS = 10 * 60 * 1000

function truncateForLog(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

export function createCodingAgentDelegateTool(options: CodingAgentDelegateToolOptions) {
  const availableTargets = new Map(
    options.codingAgents.map((codingAgent) => [codingAgent.target, codingAgent])
  )
  const supportedTargets = options.codingAgents.map((codingAgent) => codingAgent.target)

  return createTool({
    id: 'use-coding-agent',
    description: [
      'Delegate a coding-heavy task to a dedicated coding subagent.',
      'Use this for implementation, debugging, code review, build issues, repo analysis, and test failures.',
      supportedTargets.length > 0 ? `Available targets: ${supportedTargets.join(', ')}.` : ''
    ]
      .filter((value) => value.length > 0)
      .join(' '),
    inputSchema: z
      .object({
        task: z.string().trim().min(1),
        target: z.string().trim().optional()
      })
      .superRefine((input, context) => {
        if (!input.target || supportedTargets.includes(input.target)) {
          return
        }

        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message: `Unsupported coding target. Expected one of: ${supportedTargets.join(', ')}`
        })
      }),
    outputSchema: z.object({
      text: z.string(),
      providerName: z.string(),
      target: z.string(),
      subAgentThreadId: z.string(),
      subAgentResourceId: z.string()
    }),
    execute: async ({ task, target }, context) => {
      const resolvedCodingAgent =
        (target ? availableTargets.get(target) : undefined) ?? options.codingAgents.at(0)
      if (!resolvedCodingAgent) {
        throw new Error('No coding agents are available.')
      }

      const agent = context?.mastra?.getAgent?.(resolvedCodingAgent.agentName)
      if (!agent) {
        throw new Error(`Coding agent "${resolvedCodingAgent.agentName}" is unavailable.`)
      }

      const subAgentThreadId = `${resolvedCodingAgent.agentName}:${randomUUID()}`
      const subAgentResourceId = resolvedCodingAgent.agentName
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null

      const run = async () => {
        const stream = await agent.stream(
          [{ role: 'user', content: task }] as never,
          {
            requestContext: context?.requestContext,
            ...(typeof options.maxSteps === 'number' ? { maxSteps: options.maxSteps } : {}),
            ...(resolvedCodingAgent.providerOptions
              ? { providerOptions: resolvedCodingAgent.providerOptions }
              : {}),
            memory: {
              resource: subAgentResourceId,
              thread: subAgentThreadId,
              options: {
                lastMessages: false
              }
            }
          } as never
        )

        const text = await stream.text
        return {
          text,
          providerName: resolvedCodingAgent.providerName,
          target: resolvedCodingAgent.target,
          subAgentThreadId,
          subAgentResourceId
        }
      }

      try {
        return await Promise.race([
          run(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(
                new Error(
                  `use-coding-agent timed out after ${DEFAULT_CODING_AGENT_DELEGATE_TIMEOUT_MS}ms while handling "${truncateForLog(task)}".`
                )
              )
            }, DEFAULT_CODING_AGENT_DELEGATE_TIMEOUT_MS)
          })
        ])
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
      }
    }
  })
}

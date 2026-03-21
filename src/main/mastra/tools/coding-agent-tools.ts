import { randomUUID } from 'node:crypto'
import type { AgentExecutionOptions } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

type CodingAgentDelegateToolOptions = {
  codingAgentName: string
  providerName: string
  maxSteps?: number | null
  providerOptions?: AgentExecutionOptions['providerOptions']
}

const DEFAULT_CODING_AGENT_DELEGATE_TIMEOUT_MS = 10 * 60 * 1000

function truncateForLog(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

export function createCodingAgentDelegateTool(options: CodingAgentDelegateToolOptions) {
  const useCodingAgent = createTool({
    id: 'use-coding-agent',
    description:
      'Delegate a coding-heavy task to the dedicated coding subagent. Use this for implementation, debugging, code review, build issues, repo analysis, and test failures.',
    inputSchema: z.object({
      task: z.string().trim().min(1)
    }),
    outputSchema: z.object({
      text: z.string(),
      providerName: z.string(),
      subAgentThreadId: z.string(),
      subAgentResourceId: z.string()
    }),
    execute: async ({ task }, context) => {
      const agent = context?.mastra?.getAgent?.(options.codingAgentName)
      if (!agent) {
        throw new Error(`Coding agent "${options.codingAgentName}" is unavailable.`)
      }

      const subAgentThreadId = `${options.codingAgentName}:${randomUUID()}`
      const subAgentResourceId = options.codingAgentName
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null

      const run = async () => {
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

        const text = await stream.text
        return {
          text,
          providerName: options.providerName,
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

  return {
    useCodingAgent
  }
}

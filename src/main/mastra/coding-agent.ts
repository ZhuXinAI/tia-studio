import { Agent } from '@mastra/core/agent'
import type { Workspace } from '@mastra/core/workspace'
import type { Memory } from '@mastra/memory'

type CreateCodingAgentInput = {
  agentId: string
  assistantName: string
  providerName: string
  memory: Memory
  model: unknown
  workspace?: Workspace
}

function buildCodingAgentDescription(input: {
  assistantName: string
  providerName: string
}): string {
  return [
    `Dedicated coding specialist for ${input.assistantName}.`,
    `Runs coding work through ${input.providerName} for implementation, debugging, tests, and repo analysis.`
  ].join(' ')
}

export function createCodingAgent(input: CreateCodingAgentInput): Agent {
  return new Agent({
    id: input.agentId,
    name: `${input.assistantName} ${input.providerName} Coding Agent`,
    description: buildCodingAgentDescription({
      assistantName: input.assistantName,
      providerName: input.providerName
    }),
    instructions: [
      'You are the dedicated coding specialist for this assistant.',
      'Focus on code changes, debugging, build failures, test failures, refactors, and repository analysis.',
      'Use the configured workspace as your source of truth.',
      'When the task requires code changes or verification, do the work instead of only describing it.',
      'Keep the final response concise and practical.',
      'Include the key files changed and any verification you ran.',
      'If the request is not actually coding-related, say so briefly and explain what coding help would be useful instead.'
    ].join(' '),
    model: input.model as never,
    memory: input.memory as never,
    ...(input.workspace ? { workspace: input.workspace } : {})
  })
}

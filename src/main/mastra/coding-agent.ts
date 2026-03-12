import { Agent } from '@mastra/core/agent'
import { codexAppServer } from 'ai-sdk-provider-codex-cli'
import {
  normalizeAssistantCodingConfig,
  resolveAssistantCodingPath,
  type AssistantCodingConfig
} from '../assistants/coding-config'

export const DEFAULT_ASSISTANT_CODING_MODEL = 'gpt-5.3-codex'

type CreateCodingSubagentInput = {
  assistantId: string
  assistantName: string
  workspaceRootPath?: string | null
  codingConfig: AssistantCodingConfig | Record<string, unknown> | null | undefined
}

function buildCodingAgentDescription(input: {
  workspaceRootPath?: string
  cwd?: string
  addDirs: string[]
}): string {
  const descriptionParts = [
    'Handles repository-aware coding tasks such as debugging, implementing changes, refactors, and tests using Codex CLI.'
  ]

  if (input.cwd) {
    descriptionParts.push(`Primary working directory: ${input.cwd}.`)
  } else if (input.workspaceRootPath) {
    descriptionParts.push(`Assistant workspace root: ${input.workspaceRootPath}.`)
  }

  if (input.workspaceRootPath && input.cwd && input.workspaceRootPath !== input.cwd) {
    descriptionParts.push(`Assistant workspace root: ${input.workspaceRootPath}.`)
  }

  if (input.addDirs.length > 0) {
    descriptionParts.push(`Can also access: ${input.addDirs.join(', ')}.`)
  }

  return descriptionParts.join(' ')
}

export function createCodingSubagent(input: CreateCodingSubagentInput): Agent | undefined {
  const codingConfig = normalizeAssistantCodingConfig(input.codingConfig)
  if (codingConfig.enabled !== true) {
    return undefined
  }

  const workspaceRootPath = resolveAssistantCodingPath(input.workspaceRootPath)
  const cwd = resolveAssistantCodingPath(codingConfig.cwd, workspaceRootPath) ?? workspaceRootPath
  const addDirs = (codingConfig.addDirs ?? [])
    .map((addDir) => resolveAssistantCodingPath(addDir, cwd ?? workspaceRootPath))
    .filter((addDir): addDir is string => Boolean(addDir))

  return new Agent({
    id: `${input.assistantId}:coding`,
    name: `${input.assistantName} Coding Agent`,
    description: buildCodingAgentDescription({
      workspaceRootPath,
      cwd,
      addDirs
    }),
    instructions: [
      'You are the dedicated coding specialist for this assistant.',
      'Focus on implementation, debugging, refactors, code review follow-ups, and tests.',
      'Prefer concrete code changes and verification over general discussion.',
      'Keep responses concise and action-oriented.'
    ].join(' '),
    model: codexAppServer(DEFAULT_ASSISTANT_CODING_MODEL, {
      ...(cwd ? { cwd } : {}),
      ...(addDirs.length > 0 ? { addDirs } : {}),
      // ...(codingConfig.skipGitRepoCheck !== undefined
      //   ? { skipGitRepoCheck: codingConfig.skipGitRepoCheck }
      //   : {}),
      ...(codingConfig.fullAuto ? { fullAuto: true } : {})
      // ...(codingConfig.approvalMode ? { approvalMode: codingConfig.approvalMode } : {}),
      // ...(codingConfig.sandboxMode ? { sandboxMode: codingConfig.sandboxMode } : {})
    })
  })
}

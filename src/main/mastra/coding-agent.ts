import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import { codexAppServer } from 'ai-sdk-provider-codex-cli'
import { buildBuiltInBrowserGuidance } from '../built-in-browser-contract'
import {
  normalizeAssistantCodingConfig,
  resolveAssistantCodingPath,
  type AssistantCodingConfig
} from '../assistants/coding-config'
import type { ManagedRuntimesState } from '../persistence/repos/managed-runtimes-repo'

export const DEFAULT_ASSISTANT_CODING_MODEL = 'gpt-5.3-codex'

type CreateCodingSubagentInput = {
  assistantId: string
  assistantName: string
  workspaceRootPath?: string | null
  codingConfig: AssistantCodingConfig | Record<string, unknown> | null | undefined
  managedRuntimeState?: ManagedRuntimesState | null
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

function isManagedRuntimeReady(record: ManagedRuntimesState[keyof ManagedRuntimesState] | undefined): boolean {
  return Boolean(record?.binaryPath) && (
    record.status === 'ready' ||
    record.status === 'custom-ready' ||
    record.status === 'update-available'
  )
}

function resolveManagedRuntimeAccessPaths(
  managedRuntimeState: ManagedRuntimesState | null | undefined
): string[] {
  if (!managedRuntimeState) {
    return []
  }

  return Object.values(managedRuntimeState)
    .filter((record) => isManagedRuntimeReady(record))
    .map((record) => path.dirname(record.binaryPath as string))
}

function toUniquePaths(paths: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const uniquePaths: string[] = []

  for (const candidate of paths) {
    if (!candidate) {
      continue
    }

    const normalized = path.resolve(candidate)
    if (seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    uniquePaths.push(normalized)
  }

  return uniquePaths
}

function buildManagedRuntimeGuidance(input: {
  managedRuntimeState?: ManagedRuntimesState | null
  runtimeAccessPaths: string[]
}): string {
  if (!input.managedRuntimeState) {
    return ''
  }

  const guidanceLines: string[] = []
  if (isManagedRuntimeReady(input.managedRuntimeState.bun)) {
    guidanceLines.push(
      'Managed bun is available. If the user asks to run npx-backed tooling or install skills, infer that npx should use the managed bunx path. Prefer bunx, or the managed bun binary with x, instead of raw npx when possible.'
    )
  }

  if (isManagedRuntimeReady(input.managedRuntimeState['agent-browser'])) {
    guidanceLines.push(
      'Managed agent-browser is available. Reuse that runtime when the user wants agent-browser instead of reinstalling it.'
    )
  }

  if (input.runtimeAccessPaths.length > 0) {
    guidanceLines.push(
      `Managed runtime directories are already included in your accessible workspace roots: ${input.runtimeAccessPaths.join(', ')}.`
    )
  }

  return guidanceLines.join(' ')
}

function resolveSandboxPolicy(input: {
  writableRoots: string[]
  codingConfig: AssistantCodingConfig
}):
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access'
  | { type: 'readOnly' }
  | { type: 'workspaceWrite'; writableRoots?: string[] } {
  if (input.codingConfig.sandboxMode === 'danger-full-access') {
    return 'danger-full-access'
  }

  if (input.codingConfig.sandboxMode === 'read-only') {
    return { type: 'readOnly' }
  }

  if (input.writableRoots.length === 0) {
    return 'workspace-write'
  }

  return {
    type: 'workspaceWrite',
    writableRoots: input.writableRoots
  }
}

export function createCodingSubagent(input: CreateCodingSubagentInput): Agent | undefined {
  const codingConfig = normalizeAssistantCodingConfig(input.codingConfig)
  if (codingConfig.enabled !== true) {
    return undefined
  }

  const workspaceRootPath = resolveAssistantCodingPath(input.workspaceRootPath)
  const cwd = resolveAssistantCodingPath(codingConfig.cwd, workspaceRootPath) ?? workspaceRootPath
  const configuredAddDirs = (codingConfig.addDirs ?? [])
    .map((addDir) => resolveAssistantCodingPath(addDir, cwd ?? workspaceRootPath))
    .filter((addDir): addDir is string => Boolean(addDir))
  const runtimeAccessPaths = resolveManagedRuntimeAccessPaths(input.managedRuntimeState)
  const addDirs = toUniquePaths([...configuredAddDirs, ...runtimeAccessPaths])
  const writableRoots = toUniquePaths([workspaceRootPath, cwd, ...addDirs])
  const runtimeGuidance = buildManagedRuntimeGuidance({
    managedRuntimeState: input.managedRuntimeState,
    runtimeAccessPaths
  })

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
      'Keep responses concise and action-oriented.',
      runtimeGuidance,
      buildBuiltInBrowserGuidance({
        handoffToolAvailable: false
      })
    ].join(' '),
    model: codexAppServer(DEFAULT_ASSISTANT_CODING_MODEL, {
      ...(cwd ? { cwd } : {}),
      ...(addDirs.length > 0 ? { addDirs } : {}),
      ...(codingConfig.approvalMode ? { approvalPolicy: codingConfig.approvalMode } : {}),
      sandboxPolicy: resolveSandboxPolicy({
        writableRoots,
        codingConfig
      }),
      // ...(codingConfig.skipGitRepoCheck !== undefined
      //   ? { skipGitRepoCheck: codingConfig.skipGitRepoCheck }
      //   : {}),
      ...(codingConfig.fullAuto ? { fullAuto: true } : {})
      // ...(codingConfig.approvalMode ? { approvalMode: codingConfig.approvalMode } : {}),
      // ...(codingConfig.sandboxMode ? { sandboxMode: codingConfig.sandboxMode } : {})
    })
  })
}

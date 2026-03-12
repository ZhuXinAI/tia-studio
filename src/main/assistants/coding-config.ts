import path from 'node:path'

export const ASSISTANT_CODING_APPROVAL_MODES = [
  'untrusted',
  'on-failure',
  'on-request',
  'never'
] as const

export const ASSISTANT_CODING_SANDBOX_MODES = [
  'read-only',
  'workspace-write',
  'danger-full-access'
] as const

export type AssistantCodingApprovalMode = (typeof ASSISTANT_CODING_APPROVAL_MODES)[number]
export type AssistantCodingSandboxMode = (typeof ASSISTANT_CODING_SANDBOX_MODES)[number]

export type AssistantCodingConfig = {
  enabled?: boolean
  cwd?: string
  addDirs?: string[]
  skipGitRepoCheck?: boolean
  fullAuto?: boolean
  approvalMode?: AssistantCodingApprovalMode
  sandboxMode?: AssistantCodingSandboxMode
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const uniqueValues = new Set<string>()

  for (const entry of value) {
    const normalized = toNonEmptyString(entry)
    if (normalized) {
      uniqueValues.add(normalized)
    }
  }

  return [...uniqueValues]
}

export function normalizeAssistantCodingConfig(
  value: Record<string, unknown> | AssistantCodingConfig | null | undefined
): AssistantCodingConfig {
  const normalizedConfig: AssistantCodingConfig = {}
  const rawConfig =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  if (rawConfig.enabled === true) {
    normalizedConfig.enabled = true
  }

  const cwd = toNonEmptyString(rawConfig.cwd)
  if (cwd) {
    normalizedConfig.cwd = cwd
  }

  const addDirs = toUniqueStringList(rawConfig.addDirs)
  if (addDirs.length > 0) {
    normalizedConfig.addDirs = addDirs
  }

  if (typeof rawConfig.skipGitRepoCheck === 'boolean') {
    normalizedConfig.skipGitRepoCheck = rawConfig.skipGitRepoCheck
  }

  if (typeof rawConfig.fullAuto === 'boolean') {
    normalizedConfig.fullAuto = rawConfig.fullAuto
  }

  const approvalMode = toNonEmptyString(rawConfig.approvalMode)
  if (
    approvalMode &&
    ASSISTANT_CODING_APPROVAL_MODES.includes(approvalMode as AssistantCodingApprovalMode)
  ) {
    normalizedConfig.approvalMode = approvalMode as AssistantCodingApprovalMode
  }

  const sandboxMode = toNonEmptyString(rawConfig.sandboxMode)
  if (
    sandboxMode &&
    ASSISTANT_CODING_SANDBOX_MODES.includes(sandboxMode as AssistantCodingSandboxMode)
  ) {
    normalizedConfig.sandboxMode = sandboxMode as AssistantCodingSandboxMode
  }

  return normalizedConfig
}

export function resolveAssistantCodingPath(
  rawPath: string | null | undefined,
  basePath?: string | null
): string | undefined {
  const normalizedPath = toNonEmptyString(rawPath)
  if (!normalizedPath) {
    return undefined
  }

  if (path.isAbsolute(normalizedPath)) {
    return path.resolve(normalizedPath)
  }

  if (basePath && basePath.trim().length > 0) {
    return path.resolve(basePath, normalizedPath)
  }

  return path.resolve(normalizedPath)
}

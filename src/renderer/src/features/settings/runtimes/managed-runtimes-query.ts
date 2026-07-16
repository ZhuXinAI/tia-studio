import { createApiClient } from '../../../lib/api-client'

export type ManagedRuntimeKind = 'agent-browser' | 'bun' | 'uv'
export type ManagedRuntimeSource = 'managed' | 'custom' | 'none'
export type ManagedRuntimeStatus =
  | 'missing'
  | 'installing'
  | 'ready'
  | 'custom-ready'
  | 'update-available'
  | 'invalid-custom-path'
  | 'download-failed'
  | 'extract-failed'
  | 'validation-failed'

export type ManagedRuntimeRecord = {
  source: ManagedRuntimeSource
  binaryPath: string | null
  version: string | null
  installedAt: string | null
  lastCheckedAt: string | null
  releaseUrl: string | null
  checksum: string | null
  status: ManagedRuntimeStatus
  errorMessage: string | null
}

export type ManagedRuntimesState = Record<ManagedRuntimeKind, ManagedRuntimeRecord>
export type RuntimeOnboardingSkillId = 'agent-browser' | 'find-skills'

export const runtimeSetupKinds: ManagedRuntimeKind[] = ['bun', 'uv', 'agent-browser']
export const managedRuntimeKinds: ManagedRuntimeKind[] = [...runtimeSetupKinds]
const apiClient = createApiClient()

function createDefaultRecord(): ManagedRuntimeRecord {
  return {
    source: 'none',
    binaryPath: null,
    version: null,
    installedAt: null,
    lastCheckedAt: null,
    releaseUrl: null,
    checksum: null,
    status: 'missing',
    errorMessage: null
  }
}

export function createDefaultManagedRuntimesState(): ManagedRuntimesState {
  return {
    bun: createDefaultRecord(),
    uv: createDefaultRecord(),
    'agent-browser': createDefaultRecord()
  }
}

export async function getManagedRuntimeStatus(): Promise<ManagedRuntimesState> {
  return apiClient.get<ManagedRuntimesState>('/v1/desktop/managed-runtimes')
}

export async function checkManagedRuntimeLatest(
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimesState> {
  return apiClient.post<ManagedRuntimesState>(`/v1/desktop/managed-runtimes/${kind}/check-latest`)
}

export async function installManagedRuntime(
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimesState> {
  return apiClient.post<ManagedRuntimesState>(`/v1/desktop/managed-runtimes/${kind}/install`)
}

export async function pickCustomRuntime(
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimesState | null> {
  return apiClient.post<ManagedRuntimesState | null>(
    `/v1/desktop/managed-runtimes/${kind}/pick-custom`
  )
}

export async function clearManagedRuntime(kind: ManagedRuntimeKind): Promise<ManagedRuntimesState> {
  return apiClient.delete<ManagedRuntimesState>(`/v1/desktop/managed-runtimes/${kind}/custom`)
}

export async function getRuntimeOnboardingSkillsStatus(): Promise<RuntimeOnboardingSkillId[]> {
  const response = await apiClient.get<{ skillIds: RuntimeOnboardingSkillId[] }>(
    '/v1/desktop/runtime-onboarding-skills'
  )
  return response.skillIds
}

export async function installRuntimeOnboardingSkills(
  skillIds: RuntimeOnboardingSkillId[]
): Promise<RuntimeOnboardingSkillId[]> {
  const response = await apiClient.post<{ skillIds: RuntimeOnboardingSkillId[] }>(
    '/v1/desktop/runtime-onboarding-skills/install',
    {
      skillIds
    }
  )
  return response.skillIds
}

export function getRequiredManagedRuntimeKind(
  command: string | null | undefined
): ManagedRuntimeKind | null {
  const normalized = command?.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized === 'npx' || normalized === 'bun' || normalized === 'bunx') {
    return 'bun'
  }

  if (normalized === 'uv' || normalized === 'uvx') {
    return 'uv'
  }

  if (normalized === 'agent-browser') {
    return 'agent-browser'
  }

  return null
}

export function isManagedRuntimeCommand(command: string | null | undefined): boolean {
  return getRequiredManagedRuntimeKind(command) !== null
}

export function isManagedRuntimeReady(record: ManagedRuntimeRecord): boolean {
  return (
    Boolean(record.binaryPath) &&
    (record.status === 'ready' ||
      record.status === 'custom-ready' ||
      record.status === 'update-available')
  )
}

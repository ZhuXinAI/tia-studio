export type ManagedRuntimeKind = 'bun' | 'uv'
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

export const managedRuntimeKinds: ManagedRuntimeKind[] = ['bun', 'uv']

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
    uv: createDefaultRecord()
  }
}

function requireDesktopMethod<Key extends keyof NonNullable<typeof window.tiaDesktop>>(
  key: Key
): NonNullable<NonNullable<typeof window.tiaDesktop>[Key]> {
  const method = window.tiaDesktop?.[key]
  if (!method) {
    throw new Error(`Desktop bridge method "${String(key)}" is unavailable`)
  }

  return method as NonNullable<NonNullable<typeof window.tiaDesktop>[Key]>
}

export async function getManagedRuntimeStatus(): Promise<ManagedRuntimesState> {
  return requireDesktopMethod('getManagedRuntimeStatus')()
}

export async function checkManagedRuntimeLatest(
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimesState> {
  return requireDesktopMethod('checkManagedRuntimeLatest')(kind)
}

export async function installManagedRuntime(
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimesState> {
  return requireDesktopMethod('installManagedRuntime')(kind)
}

export async function pickCustomRuntime(
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimesState | null> {
  return requireDesktopMethod('pickCustomRuntime')(kind)
}

export async function clearManagedRuntime(kind: ManagedRuntimeKind): Promise<ManagedRuntimesState> {
  return requireDesktopMethod('clearManagedRuntime')(kind)
}

export async function getRuntimeOnboardingSkillsStatus(): Promise<RuntimeOnboardingSkillId[]> {
  return requireDesktopMethod('getRuntimeOnboardingSkillsStatus')()
}

export async function installRuntimeOnboardingSkills(
  skillIds: RuntimeOnboardingSkillId[]
): Promise<RuntimeOnboardingSkillId[]> {
  return requireDesktopMethod('installRuntimeOnboardingSkills')(skillIds)
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

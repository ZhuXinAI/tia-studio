import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type ManagedRuntimeKind = 'agent-browser' | 'bun' | 'uv' | 'codex-acp' | 'claude-agent-acp'
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

const runtimeKinds: ManagedRuntimeKind[] = [
  'bun',
  'uv',
  'agent-browser',
  'codex-acp',
  'claude-agent-acp'
]
const validSources = new Set<ManagedRuntimeSource>(['managed', 'custom', 'none'])
const validStatuses = new Set<ManagedRuntimeStatus>([
  'missing',
  'installing',
  'ready',
  'custom-ready',
  'update-available',
  'invalid-custom-path',
  'download-failed',
  'extract-failed',
  'validation-failed'
])

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

function createDefaultState(): ManagedRuntimesState {
  return {
    bun: createDefaultRecord(),
    uv: createDefaultRecord(),
    'agent-browser': createDefaultRecord(),
    'codex-acp': createDefaultRecord(),
    'claude-agent-acp': createDefaultRecord()
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeSource(value: unknown): ManagedRuntimeSource {
  return typeof value === 'string' && validSources.has(value as ManagedRuntimeSource)
    ? (value as ManagedRuntimeSource)
    : 'none'
}

function normalizeStatus(value: unknown): ManagedRuntimeStatus {
  return typeof value === 'string' && validStatuses.has(value as ManagedRuntimeStatus)
    ? (value as ManagedRuntimeStatus)
    : 'missing'
}

function normalizeRecord(value: unknown): ManagedRuntimeRecord {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return {
    source: normalizeSource((candidate as { source?: unknown }).source),
    binaryPath: normalizeString((candidate as { binaryPath?: unknown }).binaryPath),
    version: normalizeString((candidate as { version?: unknown }).version),
    installedAt: normalizeString((candidate as { installedAt?: unknown }).installedAt),
    lastCheckedAt: normalizeString((candidate as { lastCheckedAt?: unknown }).lastCheckedAt),
    releaseUrl: normalizeString((candidate as { releaseUrl?: unknown }).releaseUrl),
    checksum: normalizeString((candidate as { checksum?: unknown }).checksum),
    status: normalizeStatus((candidate as { status?: unknown }).status),
    errorMessage: normalizeString((candidate as { errorMessage?: unknown }).errorMessage)
  }
}

function normalizeState(value: unknown): ManagedRuntimesState {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return runtimeKinds.reduce<ManagedRuntimesState>((state, kind) => {
    state[kind] = normalizeRecord((candidate as Partial<Record<ManagedRuntimeKind, unknown>>)[kind])
    return state
  }, createDefaultState())
}

export class ManagedRuntimesRepository {
  constructor(private readonly filePath: string) {}

  async getState(): Promise<ManagedRuntimesState> {
    const rawContent = await this.readFileContent()

    if (!rawContent) {
      const defaultState = createDefaultState()
      await this.saveState(defaultState)
      return defaultState
    }

    try {
      const parsed = JSON.parse(rawContent) as unknown
      return normalizeState(parsed)
    } catch {
      throw new Error('Invalid managed-runtimes.json format')
    }
  }

  async saveState(input: ManagedRuntimesState): Promise<ManagedRuntimesState> {
    const normalized = normalizeState(input)
    await this.ensureParentDirectory()
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
    return normalized
  }

  private async readFileContent(): Promise<string | null> {
    try {
      return await readFile(this.filePath, 'utf-8')
    } catch (error) {
      if (this.isFileMissingError(error)) {
        return null
      }

      throw error
    }
  }

  private async ensureParentDirectory(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
  }

  private isFileMissingError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    )
  }
}

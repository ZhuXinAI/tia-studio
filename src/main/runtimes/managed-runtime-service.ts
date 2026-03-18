import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { basename, dirname } from 'node:path'
import { chmod, copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import {
  type ManagedRuntimeKind,
  type ManagedRuntimeRecord,
  type ManagedRuntimesState,
  ManagedRuntimesRepository
} from '../persistence/repos/managed-runtimes-repo'

export type GitHubReleaseAsset = {
  name: string
  browser_download_url: string
  digest?: string | null
}

export type GitHubRelease = {
  tag_name?: string
  html_url?: string
  assets?: GitHubReleaseAsset[]
}

type CommandResult = {
  stdout: string
  stderr: string
}

type ManagedRuntimeServiceOptions = {
  repository: ManagedRuntimesRepository
  managedRootPath: string
  fetchLatestRelease?: (kind: ManagedRuntimeKind) => Promise<GitHubRelease>
  downloadReleaseAsset?: (
    asset: GitHubReleaseAsset,
    destinationDirectory: string
  ) => Promise<string>
  installReleaseAsset?: (
    kind: ManagedRuntimeKind,
    archivePath: string,
    installDirectory: string
  ) => Promise<string>
  runCommand?: (command: string, args: string[]) => Promise<CommandResult>
  now?: () => string
  platform?: NodeJS.Platform
  arch?: NodeJS.Architecture
}

const execFileAsync = promisify(execFile)
const githubReleaseUrls: Record<ManagedRuntimeKind, string> = {
  'agent-browser': 'https://api.github.com/repos/vercel-labs/agent-browser/releases/latest',
  bun: 'https://api.github.com/repos/oven-sh/bun/releases/latest',
  uv: 'https://api.github.com/repos/astral-sh/uv/releases/latest'
}

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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected managed runtime error.'
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeVersionOutput(stdout: string): string | null {
  const normalized = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return normalized ?? null
}

function runtimeBinaryName(kind: ManagedRuntimeKind, platform: NodeJS.Platform): string {
  const suffix = platform === 'win32' ? '.exe' : ''

  if (kind === 'agent-browser') {
    return `agent-browser${suffix}`
  }

  return `${kind}${suffix}`
}

function resolveBunxCommand(binaryPath: string): {
  command: string
  extraArgs: string[]
} {
  return {
    command: binaryPath,
    extraArgs: ['x']
  }
}

function resolveUvxCommand(binaryPath: string): {
  command: string
  extraArgs: string[]
} {
  return {
    command: binaryPath,
    extraArgs: ['tool', 'run']
  }
}

async function defaultFetchLatestRelease(kind: ManagedRuntimeKind): Promise<GitHubRelease> {
  const response = await fetch(githubReleaseUrls[kind], {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TIA-Studio'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed for ${kind}: ${response.status}`)
  }

  const payload = (await response.json()) as {
    tag_name?: unknown
    html_url?: unknown
    assets?: unknown
  }

  const assets = Array.isArray(payload.assets)
    ? payload.assets.reduce<GitHubReleaseAsset[]>((result, asset) => {
        if (!asset || typeof asset !== 'object') {
          return result
        }

        const name = toNonEmptyString((asset as { name?: unknown }).name)
        const browserDownloadUrl = toNonEmptyString(
          (asset as { browser_download_url?: unknown }).browser_download_url
        )

        if (!name || !browserDownloadUrl) {
          return result
        }

        result.push({
          name,
          browser_download_url: browserDownloadUrl,
          digest: toNonEmptyString((asset as { digest?: unknown }).digest) ?? undefined
        })
        return result
      }, [])
    : []

  return {
    tag_name: toNonEmptyString(payload.tag_name) ?? undefined,
    html_url: toNonEmptyString(payload.html_url) ?? undefined,
    assets
  }
}

async function defaultDownloadReleaseAsset(
  asset: GitHubReleaseAsset,
  destinationDirectory: string
): Promise<string> {
  await mkdir(destinationDirectory, { recursive: true })

  const targetPath = join(destinationDirectory, basename(asset.browser_download_url) || asset.name)
  const response = await fetch(asset.browser_download_url)

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  await writeFile(targetPath, Buffer.from(arrayBuffer))
  return targetPath
}

async function extractArchive(
  archivePath: string,
  destinationDirectory: string,
  runCommand: (command: string, args: string[]) => Promise<CommandResult>,
  platform: NodeJS.Platform
): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      await runCommand('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationDirectory.replace(/'/g, "''")}' -Force`
      ])
      return
    }

    await runCommand('unzip', ['-oq', archivePath, '-d', destinationDirectory])
    return
  }

  if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    await runCommand('tar', ['-xzf', archivePath, '-C', destinationDirectory])
    return
  }

  await copyFile(archivePath, join(destinationDirectory, basename(archivePath)))
}

function isArchiveAsset(filePath: string): boolean {
  return filePath.endsWith('.zip') || filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')
}

async function findBinaryPath(directory: string, binaryName: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isFile() && entry.name === binaryName) {
      return entryPath
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const found = await findBinaryPath(join(directory, entry.name), binaryName)
    if (found) {
      return found
    }
  }

  return null
}

async function defaultInstallReleaseAsset(
  kind: ManagedRuntimeKind,
  archivePath: string,
  installDirectory: string,
  options: {
    runCommand: (command: string, args: string[]) => Promise<CommandResult>
    platform: NodeJS.Platform
  }
): Promise<string> {
  await rm(installDirectory, { recursive: true, force: true })
  await mkdir(installDirectory, { recursive: true })
  const binaryName = runtimeBinaryName(kind, options.platform)

  if (!isArchiveAsset(archivePath)) {
    const binaryPath = join(installDirectory, binaryName)
    await copyFile(archivePath, binaryPath)

    if (options.platform !== 'win32') {
      await chmod(binaryPath, 0o755)
    }

    return binaryPath
  }

  await extractArchive(archivePath, installDirectory, options.runCommand, options.platform)

  const binaryPath = await findBinaryPath(installDirectory, binaryName)

  if (!binaryPath) {
    throw new Error(`Unable to locate ${kind} binary in downloaded release`)
  }

  if (options.platform !== 'win32') {
    await chmod(binaryPath, 0o755)
  }

  return binaryPath
}

function isRuntimeRecordActive(
  record: ManagedRuntimeRecord | undefined
): record is ManagedRuntimeRecord {
  return (
    record !== undefined &&
    Boolean(record.binaryPath) &&
    (record.status === 'ready' ||
      record.status === 'custom-ready' ||
      record.status === 'update-available')
  )
}

function createManagedRuntimeEnv(
  state: ManagedRuntimesState,
  env: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const runtimeDirs = [state.bun, state.uv, state['agent-browser']]
    .filter((record): record is ManagedRuntimeRecord => isRuntimeRecordActive(record))
    .map((record) => dirname(record.binaryPath as string))

  if (runtimeDirs.length === 0) {
    return { ...env }
  }

  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  const existingPath = env[pathKey] ?? ''

  return {
    ...env,
    [pathKey]:
      runtimeDirs.join(process.platform === 'win32' ? ';' : ':') +
      (existingPath ? `${process.platform === 'win32' ? ';' : ':'}${existingPath}` : '')
  }
}

export class ManagedRuntimeService {
  private readonly repository: ManagedRuntimesRepository
  private readonly managedRootPath: string
  private readonly fetchLatestRelease: (kind: ManagedRuntimeKind) => Promise<GitHubRelease>
  private readonly downloadReleaseAsset: (
    asset: GitHubReleaseAsset,
    destinationDirectory: string
  ) => Promise<string>
  private readonly installReleaseAsset: (
    kind: ManagedRuntimeKind,
    archivePath: string,
    installDirectory: string
  ) => Promise<string>
  private readonly runCommand: (command: string, args: string[]) => Promise<CommandResult>
  private readonly now: () => string
  private readonly platform: NodeJS.Platform
  private readonly arch: NodeJS.Architecture

  constructor(options: ManagedRuntimeServiceOptions) {
    this.repository = options.repository
    this.managedRootPath = options.managedRootPath
    this.fetchLatestRelease = options.fetchLatestRelease ?? defaultFetchLatestRelease
    this.runCommand =
      options.runCommand ??
      (async (command, args) => {
        const result = await execFileAsync(command, args, { encoding: 'utf8' })
        return {
          stdout: result.stdout,
          stderr: result.stderr
        }
      })
    this.downloadReleaseAsset = options.downloadReleaseAsset ?? defaultDownloadReleaseAsset
    this.installReleaseAsset =
      options.installReleaseAsset ??
      ((kind, archivePath, installDirectory) =>
        defaultInstallReleaseAsset(kind, archivePath, installDirectory, {
          runCommand: this.runCommand,
          platform: this.platform
        }))
    this.now = options.now ?? (() => new Date().toISOString())
    this.platform = options.platform ?? process.platform
    this.arch = options.arch ?? process.arch
  }

  async getStatus(): Promise<ManagedRuntimesState> {
    return this.repository.getState()
  }

  async checkLatest(kind: ManagedRuntimeKind): Promise<ManagedRuntimesState> {
    const state = await this.repository.getState()
    const current = state[kind]
    const checkedAt = this.now()

    try {
      const release = await this.fetchLatestRelease(kind)
      const asset = ManagedRuntimeService.selectReleaseAsset(
        kind,
        this.platform,
        this.arch,
        release.assets ?? []
      )

      if (!asset) {
        throw new Error(`No ${kind} release asset available for ${this.platform} ${this.arch}`)
      }

      const releaseVersion = toNonEmptyString(release.tag_name)
      state[kind] = {
        ...current,
        lastCheckedAt: checkedAt,
        releaseUrl: toNonEmptyString(release.html_url) ?? asset.browser_download_url,
        checksum: asset.digest ?? null,
        status:
          current.status === 'ready' &&
          releaseVersion &&
          current.version &&
          current.version !== releaseVersion
            ? 'update-available'
            : current.status,
        errorMessage: null
      }
    } catch (error) {
      state[kind] = {
        ...current,
        lastCheckedAt: checkedAt,
        errorMessage: toErrorMessage(error)
      }
    }

    return this.repository.saveState(state)
  }

  async installManagedRuntime(kind: ManagedRuntimeKind): Promise<ManagedRuntimesState> {
    const initialState = await this.repository.getState()
    initialState[kind] = {
      ...initialState[kind],
      source: 'managed',
      status: 'installing',
      errorMessage: null
    }
    await this.repository.saveState(initialState)

    const checkedAt = this.now()
    const downloadDirectory = join(this.managedRootPath, '.downloads', kind)
    const installDirectory = join(this.managedRootPath, kind)

    try {
      const release = await this.fetchLatestRelease(kind)
      const asset = ManagedRuntimeService.selectReleaseAsset(
        kind,
        this.platform,
        this.arch,
        release.assets ?? []
      )

      if (!asset) {
        throw new Error(`No ${kind} release asset available for ${this.platform} ${this.arch}`)
      }

      let downloadedArchivePath: string
      try {
        downloadedArchivePath = await this.downloadReleaseAsset(asset, downloadDirectory)
      } catch (error) {
        return this.saveFailureState(kind, {
          status: 'download-failed',
          errorMessage: toErrorMessage(error)
        })
      }

      let binaryPath: string
      try {
        binaryPath = await this.installReleaseAsset(kind, downloadedArchivePath, installDirectory)
      } catch (error) {
        return this.saveFailureState(kind, {
          status: 'extract-failed',
          errorMessage: toErrorMessage(error)
        })
      }

      try {
        const version = await this.validateRuntimePath(binaryPath)

        const state = await this.repository.getState()
        state[kind] = {
          source: 'managed',
          binaryPath,
          version,
          installedAt: checkedAt,
          lastCheckedAt: checkedAt,
          releaseUrl: toNonEmptyString(release.html_url) ?? asset.browser_download_url,
          checksum: asset.digest ?? null,
          status: 'ready',
          errorMessage: null
        }

        return this.repository.saveState(state)
      } catch (error) {
        return this.saveFailureState(kind, {
          status: 'validation-failed',
          errorMessage: toErrorMessage(error)
        })
      }
    } catch (error) {
      return this.saveFailureState(kind, {
        status: 'download-failed',
        errorMessage: toErrorMessage(error)
      })
    }
  }

  async setCustomRuntime(
    kind: ManagedRuntimeKind,
    selectedPath: string
  ): Promise<ManagedRuntimesState> {
    const installedAt = this.now()
    const state = await this.repository.getState()

    try {
      const version = await this.validateRuntimePath(selectedPath)
      state[kind] = {
        source: 'custom',
        binaryPath: selectedPath,
        version,
        installedAt,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'custom-ready',
        errorMessage: null
      }
    } catch (error) {
      state[kind] = {
        source: 'custom',
        binaryPath: selectedPath,
        version: null,
        installedAt: null,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'invalid-custom-path',
        errorMessage: toErrorMessage(error)
      }
    }

    return this.repository.saveState(state)
  }

  async clearRuntime(kind: ManagedRuntimeKind): Promise<ManagedRuntimesState> {
    const state = await this.repository.getState()
    state[kind] = createDefaultRecord()
    return this.repository.saveState(state)
  }

  async resolveManagedCommand(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env
  ): Promise<{
    command: string
    args: string[]
    env: NodeJS.ProcessEnv
  }> {
    const state = await this.repository.getState()
    const nextEnv = createManagedRuntimeEnv(state, env)
    const bunPath = isRuntimeRecordActive(state.bun) ? state.bun.binaryPath : null
    const uvPath = isRuntimeRecordActive(state.uv) ? state.uv.binaryPath : null
    const agentBrowserPath = isRuntimeRecordActive(state['agent-browser'])
      ? state['agent-browser'].binaryPath
      : null

    if (command === 'bun' && bunPath) {
      return { command: bunPath, args, env: nextEnv }
    }

    if ((command === 'bunx' || command === 'npx') && bunPath) {
      const bunx = resolveBunxCommand(bunPath)
      return {
        command: bunx.command,
        args: [...bunx.extraArgs, ...args],
        env: nextEnv
      }
    }

    if (command === 'uv' && uvPath) {
      return { command: uvPath, args, env: nextEnv }
    }

    if (command === 'uvx' && uvPath) {
      const uvx = resolveUvxCommand(uvPath)
      return {
        command: uvx.command,
        args: [...uvx.extraArgs, ...args],
        env: nextEnv
      }
    }

    if (command === 'agent-browser' && agentBrowserPath) {
      return {
        command: agentBrowserPath,
        args,
        env: nextEnv
      }
    }

    return { command, args, env: nextEnv }
  }

  static selectReleaseAsset(
    kind: ManagedRuntimeKind,
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
    assets: GitHubReleaseAsset[]
  ): GitHubReleaseAsset | null {
    const patterns = ManagedRuntimeService.getAssetNamePatterns(kind, platform, arch)
    if (patterns.length === 0) {
      return null
    }

    for (const pattern of patterns) {
      for (const candidateName of ManagedRuntimeService.getPreferredAssetNames(pattern)) {
        const asset = assets.find(
          (candidate) =>
            candidate.name === candidateName &&
            !ManagedRuntimeService.shouldIgnoreAsset(kind, candidate)
        )
        if (asset) {
          return asset
        }
      }
    }

    for (const pattern of patterns) {
      const asset = assets.find(
        (candidate) =>
          candidate.name.includes(pattern) &&
          !ManagedRuntimeService.shouldIgnoreAsset(kind, candidate)
      )
      if (asset) {
        return asset
      }
    }

    return null
  }

  private static getAssetNamePatterns(
    kind: ManagedRuntimeKind,
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture
  ): string[] {
    if (kind === 'bun') {
      if (platform === 'darwin' && arch === 'arm64') {
        return ['bun-darwin-aarch64']
      }
      if (platform === 'darwin' && arch === 'x64') {
        return ['bun-darwin-x64']
      }
      if (platform === 'linux' && arch === 'arm64') {
        return ['bun-linux-aarch64']
      }
      if (platform === 'linux' && arch === 'x64') {
        return ['bun-linux-x64-baseline', 'bun-linux-x64']
      }
      if (platform === 'win32' && arch === 'arm64') {
        return ['bun-windows-aarch64']
      }
      if (platform === 'win32' && arch === 'x64') {
        return ['bun-windows-x64']
      }
      return []
    }

    if (kind === 'agent-browser') {
      if (platform === 'darwin' && arch === 'arm64') {
        return ['agent-browser-darwin-arm64']
      }
      if (platform === 'darwin' && arch === 'x64') {
        return ['agent-browser-darwin-x64']
      }
      if (platform === 'linux' && arch === 'arm64') {
        return ['agent-browser-linux-arm64', 'agent-browser-linux-musl-arm64']
      }
      if (platform === 'linux' && arch === 'x64') {
        return ['agent-browser-linux-x64', 'agent-browser-linux-musl-x64']
      }
      if (platform === 'win32' && arch === 'x64') {
        return ['agent-browser-win32-x64']
      }
      return []
    }

    if (platform === 'darwin' && arch === 'arm64') {
      return ['uv-aarch64-apple-darwin']
    }
    if (platform === 'darwin' && arch === 'x64') {
      return ['uv-x86_64-apple-darwin']
    }
    if (platform === 'linux' && arch === 'arm64') {
      return ['uv-aarch64-unknown-linux-gnu']
    }
    if (platform === 'linux' && arch === 'x64') {
      return ['uv-x86_64-unknown-linux-gnu']
    }
    if (platform === 'win32' && arch === 'arm64') {
      return ['uv-aarch64-pc-windows-msvc']
    }
    if (platform === 'win32' && arch === 'x64') {
      return ['uv-x86_64-pc-windows-msvc']
    }

    return []
  }

  private static getPreferredAssetNames(pattern: string): string[] {
    return [`${pattern}.zip`, `${pattern}.tar.gz`, `${pattern}.tgz`, pattern]
  }

  private static shouldIgnoreAsset(
    kind: ManagedRuntimeKind,
    candidate: GitHubReleaseAsset
  ): boolean {
    return kind === 'bun' && candidate.name.includes('-profile')
  }

  private async validateRuntimePath(binaryPath: string): Promise<string> {
    const { stdout } = await this.runCommand(binaryPath, ['--version'])
    const version = normalizeVersionOutput(stdout)

    if (!version) {
      throw new Error('Runtime version output was empty')
    }

    return version
  }

  private async saveFailureState(
    kind: ManagedRuntimeKind,
    input: {
      status: ManagedRuntimeRecord['status']
      errorMessage: string
    }
  ): Promise<ManagedRuntimesState> {
    const state = await this.repository.getState()
    state[kind] = {
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: state[kind].lastCheckedAt,
      releaseUrl: null,
      checksum: null,
      status: input.status,
      errorMessage: input.errorMessage
    }

    return this.repository.saveState(state)
  }
}

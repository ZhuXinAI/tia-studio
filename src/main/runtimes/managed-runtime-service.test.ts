import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagedRuntimesRepository } from '../persistence/repos/managed-runtimes-repo'
import { ManagedRuntimeService } from './managed-runtime-service'

describe('ManagedRuntimeService', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-managed-runtime-service-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('selects a bun release asset for darwin arm64', () => {
    const asset = ManagedRuntimeService.selectReleaseAsset('bun', 'darwin', 'arm64', [
      {
        name: 'bun-darwin-aarch64.zip',
        browser_download_url: 'https://example.test/bun.zip'
      }
    ])

    expect(asset?.browser_download_url).toBe('https://example.test/bun.zip')
  })

  it('prefers installable bun archives over profile assets', () => {
    const asset = ManagedRuntimeService.selectReleaseAsset('bun', 'darwin', 'arm64', [
      {
        name: 'bun-darwin-aarch64-profile.zip',
        browser_download_url: 'https://example.test/bun-profile.zip'
      },
      {
        name: 'bun-darwin-aarch64.zip',
        browser_download_url: 'https://example.test/bun.zip'
      }
    ])

    expect(asset?.browser_download_url).toBe('https://example.test/bun.zip')
  })

  it('validates a custom runtime path by running --version', async () => {
    const repository = new ManagedRuntimesRepository(path.join(tempDir, 'managed-runtimes.json'))
    const runCommand = vi.fn(async () => ({
      stdout: 'uv 0.7.2\n',
      stderr: ''
    }))
    const service = new ManagedRuntimeService({
      repository,
      managedRootPath: path.join(tempDir, 'managed'),
      runCommand
    })

    const state = await service.setCustomRuntime('uv', '/custom/tools/uv')

    expect(runCommand).toHaveBeenCalledWith('/custom/tools/uv', ['--version'])
    expect(state.uv).toEqual({
      source: 'custom',
      binaryPath: '/custom/tools/uv',
      version: 'uv 0.7.2',
      installedAt: expect.any(String),
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'custom-ready',
      errorMessage: null
    })
  })

  it('marks the runtime as download-failed when release download fails', async () => {
    const repository = new ManagedRuntimesRepository(path.join(tempDir, 'managed-runtimes.json'))
    const service = new ManagedRuntimeService({
      repository,
      managedRootPath: path.join(tempDir, 'managed'),
      platform: 'darwin',
      arch: 'arm64',
      fetchLatestRelease: vi.fn(async () => ({
        tag_name: 'bun-v1.2.0',
        html_url: 'https://example.test/releases/bun-v1.2.0',
        assets: [
          {
            name: 'bun-darwin-aarch64.zip',
            browser_download_url: 'https://example.test/bun.zip'
          }
        ]
      })),
      downloadReleaseAsset: vi.fn(async () => {
        throw new Error('download blocked')
      })
    })

    const state = await service.installManagedRuntime('bun')

    expect(state.bun.status).toBe('download-failed')
    expect(state.bun.errorMessage).toBe('download blocked')
  })

  it('marks the runtime as validation-failed when binary validation fails', async () => {
    const repository = new ManagedRuntimesRepository(path.join(tempDir, 'managed-runtimes.json'))
    const service = new ManagedRuntimeService({
      repository,
      managedRootPath: path.join(tempDir, 'managed'),
      platform: 'darwin',
      arch: 'arm64',
      fetchLatestRelease: vi.fn(async () => ({
        tag_name: 'bun-v1.2.0',
        html_url: 'https://example.test/releases/bun-v1.2.0',
        assets: [
          {
            name: 'bun-darwin-aarch64.zip',
            browser_download_url: 'https://example.test/bun.zip'
          }
        ]
      })),
      downloadReleaseAsset: vi.fn(async () => path.join(tempDir, 'downloads', 'bun.zip')),
      installReleaseAsset: vi.fn(async () => path.join(tempDir, 'managed', 'bun', 'bun')),
      runCommand: vi.fn(async () => {
        throw new Error('validation crashed')
      })
    })

    const state = await service.installManagedRuntime('bun')

    expect(state.bun.status).toBe('validation-failed')
    expect(state.bun.errorMessage).toBe('validation crashed')
  })

  it('resolves bunx through the managed bun binary', async () => {
    const repository = new ManagedRuntimesRepository(path.join(tempDir, 'managed-runtimes.json'))
    await repository.saveState({
      bun: {
        source: 'managed',
        binaryPath: '/managed/bin/bun',
        version: 'bun 1.2.0',
        installedAt: '2026-03-15T00:00:00.000Z',
        lastCheckedAt: '2026-03-15T00:00:00.000Z',
        releaseUrl: 'https://example.test/bun',
        checksum: null,
        status: 'ready',
        errorMessage: null
      },
      uv: {
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
    })
    const service = new ManagedRuntimeService({
      repository,
      managedRootPath: path.join(tempDir, 'managed')
    })

    const resolved = await service.resolveManagedCommand('bunx', ['skills', '--help'], {
      PATH: '/usr/bin'
    })

    expect(resolved).toEqual({
      command: '/managed/bin/bun',
      args: ['x', 'skills', '--help'],
      env: {
        PATH: `/managed/bin${process.platform === 'win32' ? ';' : ':'}/usr/bin`
      }
    })
  })

  it('resolves uvx through the managed uv binary', async () => {
    const repository = new ManagedRuntimesRepository(path.join(tempDir, 'managed-runtimes.json'))
    await repository.saveState({
      bun: {
        source: 'none',
        binaryPath: null,
        version: null,
        installedAt: null,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'missing',
        errorMessage: null
      },
      uv: {
        source: 'managed',
        binaryPath: '/managed/bin/uv',
        version: 'uv 0.7.2',
        installedAt: '2026-03-15T00:00:00.000Z',
        lastCheckedAt: '2026-03-15T00:00:00.000Z',
        releaseUrl: 'https://example.test/uv',
        checksum: null,
        status: 'ready',
        errorMessage: null
      }
    })
    const service = new ManagedRuntimeService({
      repository,
      managedRootPath: path.join(tempDir, 'managed')
    })

    const resolved = await service.resolveManagedCommand('uvx', ['ruff'], {})

    expect(resolved).toEqual({
      command: '/managed/bin/uv',
      args: ['tool', 'run', 'ruff'],
      env: {
        PATH: '/managed/bin'
      }
    })
  })
})

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
})

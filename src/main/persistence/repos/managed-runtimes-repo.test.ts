import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ManagedRuntimesRepository } from './managed-runtimes-repo'

describe('ManagedRuntimesRepository', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-managed-runtimes-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns default runtime state when file is missing', async () => {
    const filePath = path.join(tempDir, 'managed-runtimes.json')
    const repo = new ManagedRuntimesRepository(filePath)

    const state = await repo.getState()

    expect(state).toEqual({
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
      'agent-browser': {
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
      'codex-acp': {
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
      'claude-agent-acp': {
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
  })

  it('normalizes bun and uv runtime records from disk', async () => {
    const filePath = path.join(tempDir, 'managed-runtimes.json')
    await writeFile(
      filePath,
      JSON.stringify({
        bun: {
          source: 'managed',
          binaryPath: ' /tmp/bun ',
          version: ' 1.2.3 ',
          installedAt: ' 2026-03-08T00:00:00.000Z ',
          lastCheckedAt: ' 2026-03-08T01:00:00.000Z ',
          releaseUrl: ' https://example.test/bun ',
          checksum: ' abc123 ',
          status: 'ready',
          errorMessage: '   '
        },
        uv: {
          source: 'invalid-source',
          binaryPath: 42,
          version: '',
          installedAt: false,
          lastCheckedAt: undefined,
          releaseUrl: null,
          checksum: {},
          status: 'unknown-status',
          errorMessage: ' broken '
        },
        'agent-browser': {
          source: 'custom',
          binaryPath: ' /Applications/agent-browser ',
          version: ' agent-browser 0.21.0 ',
          installedAt: ' 2026-03-08T02:00:00.000Z ',
          lastCheckedAt: ' 2026-03-08T03:00:00.000Z ',
          releaseUrl: ' https://example.test/agent-browser ',
          checksum: ' def456 ',
          status: 'custom-ready',
          errorMessage: null
        },
        'codex-acp': {
          source: 'managed',
          binaryPath: ' /Applications/codex-acp ',
          version: ' codex-acp 0.10.0 ',
          installedAt: ' 2026-03-08T04:00:00.000Z ',
          lastCheckedAt: ' 2026-03-08T05:00:00.000Z ',
          releaseUrl: ' https://example.test/codex-acp ',
          checksum: ' ghi789 ',
          status: 'ready',
          errorMessage: null
        },
        'claude-agent-acp': {
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
      }),
      'utf-8'
    )

    const repo = new ManagedRuntimesRepository(filePath)
    const state = await repo.getState()

    expect(state.bun).toEqual({
      source: 'managed',
      binaryPath: '/tmp/bun',
      version: '1.2.3',
      installedAt: '2026-03-08T00:00:00.000Z',
      lastCheckedAt: '2026-03-08T01:00:00.000Z',
      releaseUrl: 'https://example.test/bun',
      checksum: 'abc123',
      status: 'ready',
      errorMessage: null
    })
    expect(state.uv).toEqual({
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'missing',
      errorMessage: 'broken'
    })
    expect(state['agent-browser']).toEqual({
      source: 'custom',
      binaryPath: '/Applications/agent-browser',
      version: 'agent-browser 0.21.0',
      installedAt: '2026-03-08T02:00:00.000Z',
      lastCheckedAt: '2026-03-08T03:00:00.000Z',
      releaseUrl: 'https://example.test/agent-browser',
      checksum: 'def456',
      status: 'custom-ready',
      errorMessage: null
    })
    expect(state['codex-acp']).toEqual({
      source: 'managed',
      binaryPath: '/Applications/codex-acp',
      version: 'codex-acp 0.10.0',
      installedAt: '2026-03-08T04:00:00.000Z',
      lastCheckedAt: '2026-03-08T05:00:00.000Z',
      releaseUrl: 'https://example.test/codex-acp',
      checksum: 'ghi789',
      status: 'ready',
      errorMessage: null
    })
  })

  it('persists normalized runtime fields', async () => {
    const filePath = path.join(tempDir, 'managed-runtimes.json')
    const repo = new ManagedRuntimesRepository(filePath)

    const saved = await repo.saveState({
      bun: {
        source: 'custom',
        binaryPath: ' /custom/bun ',
        version: ' 1.0.0 ',
        installedAt: ' 2026-03-08T00:00:00.000Z ',
        lastCheckedAt: ' 2026-03-08T01:00:00.000Z ',
        releaseUrl: ' ',
        checksum: null,
        status: 'custom-ready',
        errorMessage: ' custom runtime '
      },
      uv: {
        source: 'none',
        binaryPath: null,
        version: null,
        installedAt: null,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'download-failed',
        errorMessage: ' failed download '
      },
      'agent-browser': {
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
      'codex-acp': {
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
      'claude-agent-acp': {
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

    expect(saved).toEqual({
      bun: {
        source: 'custom',
        binaryPath: '/custom/bun',
        version: '1.0.0',
        installedAt: '2026-03-08T00:00:00.000Z',
        lastCheckedAt: '2026-03-08T01:00:00.000Z',
        releaseUrl: null,
        checksum: null,
        status: 'custom-ready',
        errorMessage: 'custom runtime'
      },
      uv: {
        source: 'none',
        binaryPath: null,
        version: null,
        installedAt: null,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'download-failed',
        errorMessage: 'failed download'
      },
      'agent-browser': {
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
      'codex-acp': {
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
      'claude-agent-acp': {
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

    const content = JSON.parse(await readFile(filePath, 'utf-8')) as unknown
    expect(content).toEqual(saved)
  })
})

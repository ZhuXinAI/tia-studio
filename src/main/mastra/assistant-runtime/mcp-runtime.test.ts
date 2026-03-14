import { describe, expect, it, vi } from 'vitest'
import type {
  ManagedRuntimeKind,
  ManagedRuntimesState
} from '../../persistence/repos/managed-runtimes-repo'
import {
  getRequiredManagedRuntimeKind,
  isManagedRuntimeReady,
  toCommandMcpServerDefinition
} from './mcp-runtime'

function createManagedRuntimeState(readyKinds: ManagedRuntimeKind[] = []): ManagedRuntimesState {
  const isReady = (kind: ManagedRuntimeKind): boolean => readyKinds.includes(kind)

  return {
    bun: {
      source: isReady('bun') ? 'managed' : 'none',
      binaryPath: isReady('bun') ? '/managed/bin/bun' : null,
      version: isReady('bun') ? 'bun 1.2.0' : null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: isReady('bun') ? 'ready' : 'missing',
      errorMessage: null
    },
    uv: {
      source: isReady('uv') ? 'managed' : 'none',
      binaryPath: isReady('uv') ? '/managed/bin/uv' : null,
      version: isReady('uv') ? 'uv 0.7.2' : null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: isReady('uv') ? 'ready' : 'missing',
      errorMessage: null
    }
  }
}

describe('mcp runtime helpers', () => {
  it('maps npx to the bun managed runtime', () => {
    expect(getRequiredManagedRuntimeKind('npx')).toBe('bun')
    expect(getRequiredManagedRuntimeKind('uvx')).toBe('uv')
    expect(getRequiredManagedRuntimeKind('node')).toBeNull()
  })

  it('detects whether a managed runtime is ready', () => {
    expect(isManagedRuntimeReady(createManagedRuntimeState(['bun']).bun)).toBe(true)
    expect(isManagedRuntimeReady(createManagedRuntimeState([]).bun)).toBe(false)
  })

  it('resolves command MCP definitions through the managed runtime resolver', async () => {
    const managedRuntimeResolver = {
      getStatus: async () => createManagedRuntimeState(['bun']),
      resolveManagedCommand: vi.fn(async (_command: string, args: string[], env = {}) => ({
        command: '/managed/bin/bunx',
        args,
        env: {
          ...env,
          PATH: '/managed/bin'
        }
      }))
    }

    const definition = await toCommandMcpServerDefinition({
      command: 'npx',
      args: ['-y', 'tool'],
      env: { FOO: 'bar' },
      managedRuntimeResolver
    })

    expect(definition).toEqual({
      command: '/managed/bin/bunx',
      args: ['-y', 'tool'],
      env: {
        FOO: 'bar',
        PATH: '/managed/bin'
      }
    })
  })

  it('throws a guided error when a required managed runtime is unavailable', async () => {
    const managedRuntimeResolver = {
      getStatus: async () => createManagedRuntimeState([]),
      resolveManagedCommand: vi.fn(async (command: string, args: string[], env = {}) => ({
        command,
        args,
        env
      }))
    }

    await expect(
      toCommandMcpServerDefinition({
        command: 'npx',
        args: ['-y', 'tool'],
        env: {},
        managedRuntimeResolver
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'managed_runtime_missing'
    })

    expect(managedRuntimeResolver.resolveManagedCommand).not.toHaveBeenCalled()
  })
})

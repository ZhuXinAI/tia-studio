import { describe, expect, it, vi } from 'vitest'
import type { MastraMCPServerDefinition } from '@mastra/mcp'
import type {
  ManagedRuntimeKind,
  ManagedRuntimesState
} from '../persistence/repos/managed-runtimes-repo'
import type { AppMcpServer } from '../persistence/repos/mcp-servers-repo'
import { AssistantRuntimeService } from './assistant-runtime'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/tia-studio-test'
  },
  BrowserWindow: undefined
}))

function createManagedRuntimeState(
  readyKinds: ManagedRuntimeKind[] = []
): ManagedRuntimesState {
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

function createRuntime(options?: {
  getStatus?: () => Promise<ManagedRuntimesState>
  resolveManagedCommand?: (
    command: string,
    args: string[],
    env?: NodeJS.ProcessEnv
  ) => Promise<{
    command: string
    args: string[]
    env: NodeJS.ProcessEnv
  }>
}) {
  return new AssistantRuntimeService({
    mastra: {} as never,
    assistantsRepo: {} as never,
    providersRepo: {} as never,
    threadsRepo: {} as never,
    webSearchSettingsRepo: {} as never,
    mcpServersRepo: {
      getSettings: vi.fn(async () => ({ mcpServers: {} }))
    } as never,
    managedRuntimeResolver: options
      ? {
          getStatus: options.getStatus ?? (async () => createManagedRuntimeState()),
          resolveManagedCommand:
            options.resolveManagedCommand ??
            (async (command, args, env = {}) => ({
              command,
              args,
              env
            }))
        }
      : undefined
  })
}

describe('AssistantRuntimeService runtime resolution', () => {
  it('resolves npx definitions through managed bunx', async () => {
    const runtime = createRuntime({
      getStatus: async () => createManagedRuntimeState(['bun']),
      resolveManagedCommand: vi.fn(async (_command, args, env = {}) => ({
        command: '/managed/bin/bunx',
        args,
        env: {
          ...env,
          PATH: '/managed/bin'
        }
      }))
    })

    const definitions = await (
      runtime as unknown as {
        toMcpServerDefinitions: (
          servers: Record<string, AppMcpServer>
        ) => Promise<Record<string, MastraMCPServerDefinition>>
      }
    ).toMcpServerDefinitions({
      filesystem: {
        isActive: true,
        name: 'Filesystem',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { FOO: 'bar' },
        installSource: 'manual'
      }
    })

    expect(definitions.filesystem).toEqual({
      command: '/managed/bin/bunx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: {
        FOO: 'bar',
        PATH: '/managed/bin'
      }
    })
  })

  it('resolves uvx definitions through managed uvx', async () => {
    const runtime = createRuntime({
      getStatus: async () => createManagedRuntimeState(['uv']),
      resolveManagedCommand: vi.fn(async (_command, args, env = {}) => ({
        command: '/managed/bin/uvx',
        args,
        env
      }))
    })

    const definitions = await (
      runtime as unknown as {
        toMcpServerDefinitions: (
          servers: Record<string, AppMcpServer>
        ) => Promise<Record<string, MastraMCPServerDefinition>>
      }
    ).toMcpServerDefinitions({
      tool: {
        isActive: true,
        name: 'Tool',
        type: 'stdio',
        command: 'uvx',
        args: ['ruff'],
        env: {},
        installSource: 'manual'
      }
    })

    expect(definitions.tool).toEqual({
      command: '/managed/bin/uvx',
      args: ['ruff']
    })
  })

  it('resolves bun commands through the managed bun binary', async () => {
    const runtime = createRuntime({
      getStatus: async () => createManagedRuntimeState(['bun']),
      resolveManagedCommand: vi.fn(async (_command, args, env = {}) => ({
        command: '/managed/bin/bun',
        args,
        env
      }))
    })

    const definitions = await (
      runtime as unknown as {
        toMcpServerDefinitions: (
          servers: Record<string, AppMcpServer>
        ) => Promise<Record<string, MastraMCPServerDefinition>>
      }
    ).toMcpServerDefinitions({
      runner: {
        isActive: true,
        name: 'Runner',
        type: 'stdio',
        command: 'bun',
        args: ['run', './index.ts'],
        env: {},
        installSource: 'manual'
      }
    })

    expect(definitions.runner).toEqual({
      command: '/managed/bin/bun',
      args: ['run', './index.ts']
    })
  })

  it('throws a guided error when a required managed runtime is unavailable', async () => {
    const resolveManagedCommand = vi.fn(async (command: string, args: string[], env = {}) => ({
      command,
      args,
      env
    }))
    const runtime = createRuntime({
      getStatus: async () => createManagedRuntimeState([]),
      resolveManagedCommand
    })
    const promise = (
      runtime as unknown as {
        toMcpServerDefinitions: (
          servers: Record<string, AppMcpServer>
        ) => Promise<Record<string, MastraMCPServerDefinition>>
      }
    ).toMcpServerDefinitions({
      filesystem: {
        isActive: true,
        name: 'Filesystem',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: {},
        installSource: 'manual'
      }
    })

    await expect(promise).rejects.toMatchObject({
      statusCode: 409,
      code: 'managed_runtime_missing'
    })

    await expect(promise).rejects.toThrow('Runtime Setup')

    expect(resolveManagedCommand).not.toHaveBeenCalled()
  })
})

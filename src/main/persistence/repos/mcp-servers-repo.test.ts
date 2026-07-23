import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpAuthRepository } from './mcp-auth-repo'
import { McpServersRepository } from './mcp-servers-repo'

describe('McpServersRepository', () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map(async (tempPath) => {
        await rm(tempPath, { recursive: true, force: true })
      })
    )
  })

  it('creates a default mcp.json when missing', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-mcp-test-'))
    tempPaths.push(tempDir)

    const repo = new McpServersRepository(path.join(tempDir, 'mcp.json'))
    const settings = await repo.getSettings()

    expect(settings).toEqual({
      mcpServers: {}
    })

    const fileContent = await readFile(path.join(tempDir, 'mcp.json'), 'utf-8')
    expect(JSON.parse(fileContent)).toEqual({
      mcpServers: {}
    })
  })

  it('persists normalized mcp server definitions', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-mcp-test-'))
    tempPaths.push(tempDir)

    const repo = new McpServersRepository(path.join(tempDir, 'mcp.json'))

    const saved = await repo.saveSettings({
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'demo-key'
          },
          installSource: 'unknown'
        }
      }
    })

    expect(saved).toEqual({
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'demo-key'
          },
          installSource: 'unknown'
        }
      }
    })

    await expect(repo.getSettings()).resolves.toEqual(saved)
  })

  it('clears OAuth state when a direct MCP endpoint changes', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-mcp-test-'))
    tempPaths.push(tempDir)
    const retain = vi.fn(async () => {})
    const clearState = vi.fn(async () => {})
    const repo = new McpServersRepository(path.join(tempDir, 'mcp.json'), {
      authRepository: { retain, clearState } as unknown as McpAuthRepository
    })

    const first = {
      mcpServers: {
        linear: {
          isActive: true,
          name: 'Linear',
          type: 'http',
          args: [],
          env: {},
          installSource: 'direct',
          url: 'https://mcp.linear.app/mcp'
        }
      }
    }
    await repo.saveSettings(first)
    clearState.mockClear()

    await repo.saveSettings(first)
    expect(clearState).not.toHaveBeenCalled()

    await repo.saveSettings({
      mcpServers: {
        linear: { ...first.mcpServers.linear, url: 'https://other.example.test/mcp' }
      }
    })
    expect(clearState).toHaveBeenCalledWith('linear')
    expect(retain).toHaveBeenLastCalledWith(['linear'])
  })
})

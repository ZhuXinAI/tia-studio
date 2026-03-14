import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveEnabledMcpServers, resolveSkillsPaths, resolveWorkspaceRootPath } from './workspace-tools'

describe('workspace tools helpers', () => {
  it('resolves workspace roots to absolute paths', () => {
    expect(resolveWorkspaceRootPath({ rootPath: 'tmp/workspace' })).toBe(
      path.resolve('tmp/workspace')
    )
    expect(resolveWorkspaceRootPath({})).toBeNull()
  })

  it('includes default and configured skill paths without duplicates', () => {
    const workspaceRoot = '/tmp/workspace'
    const skillsPaths = resolveSkillsPaths(workspaceRoot, {
      paths: ['/opt/skills', path.join(workspaceRoot, 'skills')],
      skillPath: '/opt/skills'
    })

    expect(skillsPaths).toEqual(
      expect.arrayContaining([
        path.join(os.homedir(), '.claude', 'skills'),
        path.join(os.homedir(), '.agent', 'skills'),
        path.join(workspaceRoot, 'skills'),
        '/opt/skills'
      ])
    )
    expect(skillsPaths.filter((entry) => entry === '/opt/skills')).toHaveLength(1)
  })

  it('filters enabled MCP servers against active settings', async () => {
    const getSettings = vi.fn(async () => ({
      mcpServers: {
        alpha: {
          isActive: true,
          name: 'Alpha',
          type: 'stdio',
          command: 'npx',
          args: ['alpha'],
          env: {},
          installSource: 'manual'
        },
        beta: {
          isActive: false,
          name: 'Beta',
          type: 'stdio',
          command: 'npx',
          args: ['beta'],
          env: {},
          installSource: 'manual'
        }
      }
    }))

    const enabledServers = await resolveEnabledMcpServers({
      mcpConfig: { alpha: true, beta: true, gamma: true },
      mcpServersRepo: { getSettings }
    })

    expect(Object.keys(enabledServers)).toEqual(['alpha'])
  })
})

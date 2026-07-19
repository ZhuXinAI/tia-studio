import { describe, expect, it, vi } from 'vitest'
import { classifyPiToolCall, createPiPermissionExtension } from './pi-permission-extension'

const base = {
  toolName: 'write',
  workspacePath: '/tmp/tia/workspace',
  credentialRoot: '/tmp/tia',
  fullAccess: false
}

describe('classifyPiToolCall', () => {
  it('allows routine workspace work in Standard Access', () => {
    expect(classifyPiToolCall({ ...base, toolPath: 'src/app.ts' })).toBe('allow')
  })
  it('requires approval for writes outside the workspace', () => {
    expect(classifyPiToolCall({ ...base, toolPath: '../other/app.ts' })).toBe('approve')
  })
  it('lets Full Access skip approval but never credential blocking', () => {
    expect(classifyPiToolCall({ ...base, fullAccess: true, toolPath: '../other/app.ts' })).toBe(
      'allow'
    )
    expect(
      classifyPiToolCall({ ...base, fullAccess: true, toolPath: '/tmp/tia/tia-studio.db' })
    ).toBe('block')
  })
  it('requires approval for destructive commands', () => {
    expect(classifyPiToolCall({ ...base, toolName: 'bash', command: 'git reset --hard' })).toBe(
      'approve'
    )
  })

  it('requires approval for routine bash commands in Ask Permission mode', () => {
    expect(classifyPiToolCall({ ...base, toolName: 'bash', command: 'pwd && ls' })).toBe('approve')
  })

  it('sends routine bash commands to the Pi confirmation UI', async () => {
    const on = vi.fn()
    const extension = createPiPermissionExtension({
      workspacePath: base.workspacePath,
      credentialRoot: base.credentialRoot,
      fullAccess: false
    })
    if (typeof extension === 'function') throw new Error('Expected a named permission extension')
    extension.factory({ on } as never)
    const handler = on.mock.calls.find(([eventName]) => eventName === 'tool_call')?.[1]
    const confirm = vi.fn(async () => false)

    const result = await handler(
      { toolName: 'bash', input: { command: 'pwd && ls' } },
      { ui: { confirm } }
    )

    expect(confirm).toHaveBeenCalledWith('Allow this action?', 'Run command: pwd && ls')
    expect(result).toEqual({ block: true, reason: 'Blocked by user' })
  })

  it('remembers a reusable command for the current session only', async () => {
    const on = vi.fn()
    const requestPermission = vi.fn(async () => 'allow-session' as const)
    const extension = createPiPermissionExtension({
      workspacePath: base.workspacePath,
      credentialRoot: base.credentialRoot,
      fullAccess: false,
      requestPermission
    })
    if (typeof extension === 'function') throw new Error('Expected a named permission extension')
    extension.factory({ on } as never)
    const handler = on.mock.calls.find(([eventName]) => eventName === 'tool_call')?.[1]

    await handler({ toolName: 'bash', input: { command: 'git status' } }, { ui: {} })
    await handler({ toolName: 'bash', input: { command: 'git status' } }, { ui: {} })

    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('persists only reusable workspace approvals', async () => {
    const on = vi.fn()
    const saveWorkspaceRules = vi.fn(async () => undefined)
    const requestPermission = vi.fn(async () => 'allow-workspace' as const)
    const extension = createPiPermissionExtension({
      workspacePath: base.workspacePath,
      credentialRoot: base.credentialRoot,
      fullAccess: false,
      requestPermission,
      saveWorkspaceRules
    })
    if (typeof extension === 'function') throw new Error('Expected a named permission extension')
    extension.factory({ on } as never)
    const handler = on.mock.calls.find(([eventName]) => eventName === 'tool_call')?.[1]

    await handler({ toolName: 'bash', input: { command: 'git status' } }, { ui: {} })
    await handler({ toolName: 'bash', input: { command: 'echo $HOME' } }, { ui: {} })

    expect(saveWorkspaceRules).toHaveBeenCalledTimes(1)
    expect(saveWorkspaceRules).toHaveBeenCalledWith([
      { tool: 'bash', argvPrefix: ['git', 'status'], display: 'git status' }
    ])
  })

  it('keeps an explicit deny effective in Full Access', async () => {
    const on = vi.fn()
    const extension = createPiPermissionExtension({
      workspacePath: base.workspacePath,
      credentialRoot: base.credentialRoot,
      fullAccess: true,
      listWorkspaceRules: async () => [
        {
          id: 'deny-status',
          workspacePath: base.workspacePath,
          tool: 'bash',
          decision: 'deny',
          argvPrefix: ['git', 'status'],
          rationale: 'Configured deny',
          origin: 'user-config',
          createdAt: '2026-07-19T00:00:00.000Z',
          updatedAt: '2026-07-19T00:00:00.000Z'
        }
      ]
    })
    if (typeof extension === 'function') throw new Error('Expected a named permission extension')
    extension.factory({ on } as never)
    const handler = on.mock.calls.find(([eventName]) => eventName === 'tool_call')?.[1]

    await expect(
      handler({ toolName: 'bash', input: { command: 'git status' } }, { ui: {} })
    ).resolves.toEqual({ block: true, reason: 'Blocked by a TIA Studio permission rule.' })
  })
})

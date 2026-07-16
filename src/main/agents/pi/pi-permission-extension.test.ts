import { describe, expect, it } from 'vitest'
import { classifyPiToolCall } from './pi-permission-extension'

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
})

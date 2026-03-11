import { describe, expect, it } from 'vitest'
import { createContainedLocalFilesystemInstructions } from './workspace-filesystem-instructions'

describe('createContainedLocalFilesystemInstructions', () => {
  it('explains that root files live directly under the workspace', () => {
    const instructions = createContainedLocalFilesystemInstructions('/tmp/assistant-workspace')

    expect(instructions).toContain('"IDENTITY.md" or "/IDENTITY.md"')
    expect(instructions).toContain('Do not prefix paths with the workspace name')
    expect(instructions).toContain('"/foo/IDENTITY.md"')
  })
})

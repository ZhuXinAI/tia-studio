import { describe, expect, it } from 'vitest'
import { buildToolNamePreview } from './tool-group'

describe('buildToolNamePreview', () => {
  it('condenses duplicate tool names and reports remaining labels', () => {
    expect(
      buildToolNamePreview([
        'read_file',
        'read_file',
        'shell_command',
        'list_files',
        'search_code'
      ])
    ).toEqual({
      visibleLabels: ['Read File x2', 'Shell Command', 'List Files'],
      remainingCount: 1
    })
  })
})

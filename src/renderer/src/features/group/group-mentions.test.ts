import { describe, expect, it } from 'vitest'
import {
  buildGroupMentionSuggestions,
  extractUniqueMentionIds
} from './group-mentions'

describe('group mention helpers', () => {
  it('builds mention suggestions from selected group members', () => {
    expect(
      buildGroupMentionSuggestions([
        {
          id: 'assistant-1',
          name: 'Planner',
          description: '',
          instructions: '',
          enabled: true,
          providerId: 'provider-1',
          workspaceConfig: {},
          skillsConfig: {},
          mcpConfig: {},
          maxSteps: 100,
          memoryConfig: null,
          createdAt: '2026-03-14T00:00:00.000Z',
          updatedAt: '2026-03-14T00:00:00.000Z'
        }
      ])
    ).toEqual([{ id: 'assistant-1', display: 'Planner' }])
  })

  it('deduplicates parsed mention ids', () => {
    expect(
      extractUniqueMentionIds([
        {
          id: 'assistant-1',
          display: 'Planner',
          childIndex: 0,
          index: 0,
          plainTextIndex: 0
        },
        {
          id: 'assistant-1',
          display: 'Planner',
          childIndex: 0,
          index: 1,
          plainTextIndex: 10
        },
        {
          id: 'assistant-2',
          display: 'Researcher',
          childIndex: 0,
          index: 2,
          plainTextIndex: 20
        }
      ])
    ).toEqual(['assistant-1', 'assistant-2'])
  })
})

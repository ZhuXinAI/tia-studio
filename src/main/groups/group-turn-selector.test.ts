import { describe, expect, it } from 'vitest'
import { selectNextGroupSpeaker } from './group-turn-selector'

describe('selectNextGroupSpeaker', () => {
  it('selects mentioned assistants before round-robin fallbacks', () => {
    const nextSpeaker = selectNextGroupSpeaker({
      members: [
        { assistantId: 'assistant-1', name: 'Planner' },
        { assistantId: 'assistant-2', name: 'Researcher' }
      ],
      recentMessages: [
        {
          authorId: 'assistant-1',
          mentions: ['assistant-2'],
          content: '@Researcher please verify the numbers'
        }
      ],
      speakersUsedInRun: ['assistant-1']
    })

    expect(nextSpeaker?.assistantId).toBe('assistant-2')
  })

  it('falls back to the first unused member when no mention is present', () => {
    const nextSpeaker = selectNextGroupSpeaker({
      members: [
        { assistantId: 'assistant-1', name: 'Planner' },
        { assistantId: 'assistant-2', name: 'Researcher' }
      ],
      recentMessages: [
        {
          authorId: null,
          mentions: [],
          content: 'Compare launch options'
        }
      ],
      speakersUsedInRun: ['assistant-1']
    })

    expect(nextSpeaker?.assistantId).toBe('assistant-2')
  })

  it('parses visible inline mentions from room text when mention ids are not provided', () => {
    const nextSpeaker = selectNextGroupSpeaker({
      members: [
        { assistantId: 'assistant-1', name: 'Planner' },
        { assistantId: 'assistant-2', name: 'Researcher' }
      ],
      recentMessages: [
        {
          authorId: null,
          mentions: [],
          content: '@Researcher please verify the numbers'
        }
      ],
      speakersUsedInRun: []
    })

    expect(nextSpeaker?.assistantId).toBe('assistant-2')
  })
})

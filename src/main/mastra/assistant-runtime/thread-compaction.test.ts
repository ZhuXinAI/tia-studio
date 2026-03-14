import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  buildThreadCompactionTranscript,
  buildThreadHistoryDocument,
  extractCompactionMessageText,
  formatDateToken
} from './thread-compaction'

describe('thread compaction helpers', () => {
  it('renders a stable transcript for mixed message parts', () => {
    const messages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Fallback user text',
        parts: [
          { type: 'text', text: 'Hello from the user.' },
          { type: 'reasoning', text: 'ignored reasoning' } as never,
          { type: 'image', image: 'data:image/png;base64,abc' } as never
        ]
      } as unknown as UIMessage,
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        parts: [{ type: 'file', mediaType: 'text/plain', filename: 'notes.txt' } as never]
      } as unknown as UIMessage
    ]

    expect(extractCompactionMessageText(messages[0])).toBe(
      'Hello from the user.\n[Image attachment omitted]'
    )
    expect(buildThreadCompactionTranscript(messages)).toBe(
      [
        '### 1. User',
        'Hello from the user.',
        '[Image attachment omitted]',
        '',
        '### 2. Assistant',
        '[File attachment omitted]'
      ].join('\n')
    )
  })

  it('builds the markdown archive document with fallback transcript text', () => {
    const document = buildThreadHistoryDocument({
      assistantName: 'TIA',
      providerName: 'OpenAI',
      modelName: 'gpt-4.1',
      threadTitle: 'Launch Plan',
      compactedAt: '2026-03-14T03:00:00.000Z',
      summary: '## Goal\nShip the release.',
      transcript: ''
    })

    expect(document).toContain('# Thread History')
    expect(document).toContain('- Thread: Launch Plan')
    expect(document).toContain('## Summary')
    expect(document).toContain('(No persisted transcript was available.)')
  })

  it('formats date tokens as yyyy-mm-dd', () => {
    expect(formatDateToken(new Date('2026-03-14T03:00:00.000Z'))).toBe('2026-03-14')
  })
})

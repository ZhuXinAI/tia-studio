import { describe, expect, it } from 'vitest'
import { PiSdkEventMapper } from './pi-sdk-event-mapper'

describe('PiSdkEventMapper', () => {
  it('maps text, thinking, and accumulated tool updates with ordered sequences', () => {
    const mapper = new PiSdkEventMapper('session-1', () => new Date('2026-07-16T00:00:00Z'))
    const started = mapper.map({
      type: 'message_start',
      message: { role: 'assistant', id: 'm1' }
    } as never)
    const text = mapper.map({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello' }
    } as never)
    const thinking = mapper.map({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 1, delta: 'Plan' }
    } as never)
    const tool = mapper.map({
      type: 'tool_execution_update',
      toolCallId: 'tool-1',
      toolName: 'bash',
      partialResult: { content: 'accumulated' }
    } as never)

    expect(started[0]).toMatchObject({ type: 'message.started', sequence: 1 })
    expect(text[0]).toMatchObject({ type: 'message.text.delta', sequence: 2, delta: 'Hello' })
    expect(thinking[0]).toMatchObject({
      type: 'message.thinking.delta',
      sequence: 3,
      delta: 'Plan'
    })
    expect(tool[0]).toMatchObject({
      type: 'tool.updated',
      sequence: 4,
      output: { content: 'accumulated' }
    })
  })

  it('drops known lifecycle events that do not change the application view', () => {
    const mapper = new PiSdkEventMapper('session-1')

    expect(mapper.map({ type: 'turn_start' } as never)).toEqual([])
    expect(mapper.map({ type: 'turn_end' } as never)).toEqual([])
    expect(mapper.map({ type: 'session_info_changed', name: 'Session' } as never)).toEqual([])
    expect(mapper.map({ type: 'thinking_level_changed', level: 'high' } as never)).toEqual([])
  })

  it('settles only after the SDK reports that queued work is exhausted', () => {
    const mapper = new PiSdkEventMapper('session-1')
    expect(mapper.map({ type: 'agent_end', messages: [], willRetry: false } as never)).toEqual([])
    expect(mapper.map({ type: 'agent_settled' } as never)[0]).toMatchObject({
      type: 'run.settled'
    })
  })
})

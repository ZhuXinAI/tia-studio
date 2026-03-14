import { RequestContext } from '@mastra/core/request-context'
import { describe, expect, it } from 'vitest'
import { GroupEventBus } from '../../groups/group-event-bus'
import { GROUP_CONTEXT_KEY } from '../tool-context'
import { createGroupTools } from './group-tools'

describe('group tools', () => {
  it('publishes room messages to the group event bus', async () => {
    const bus = new GroupEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('group.message.requested', (event) => {
      publishedEvents.push(event)
    })

    const requestContext = new RequestContext()
    requestContext.set(GROUP_CONTEXT_KEY, {
      runId: 'run-1',
      groupThreadId: 'group-thread-1',
      assistantId: 'assistant-1',
      allowedMentions: [{ assistantId: 'assistant-2', name: 'Researcher' }],
      replyToMessageId: 'msg-1',
      publishedMessagesCount: 0,
      passedTurn: false
    })

    const tools = createGroupTools({ bus })
    if (!tools.postToGroup.execute) {
      throw new Error('Expected postToGroup.execute to exist')
    }

    await tools.postToGroup.execute(
      {
        message: 'Please verify the numbers.',
        mentions: ['@Researcher', 'assistant-2', 'unknown']
      },
      { requestContext } as never
    )

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        runId: 'run-1',
        groupThreadId: 'group-thread-1',
        assistantId: 'assistant-1',
        content: 'Please verify the numbers.',
        mentions: ['assistant-2'],
        replyToMessageId: 'msg-1'
      }
    ])
  })

  it('publishes turn passes to the group event bus', async () => {
    const bus = new GroupEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('group.turn.passed', (event) => {
      publishedEvents.push(event)
    })

    const requestContext = new RequestContext()
    requestContext.set(GROUP_CONTEXT_KEY, {
      runId: 'run-2',
      groupThreadId: 'group-thread-1',
      assistantId: 'assistant-2',
      allowedMentions: [],
      replyToMessageId: null,
      publishedMessagesCount: 0,
      passedTurn: false
    })

    const tools = createGroupTools({ bus })
    if (!tools.passGroupTurn.execute) {
      throw new Error('Expected passGroupTurn.execute to exist')
    }

    await tools.passGroupTurn.execute(
      {
        reason: 'Waiting for more context.'
      },
      { requestContext } as never
    )

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        runId: 'run-2',
        groupThreadId: 'group-thread-1',
        assistantId: 'assistant-2',
        reason: 'Waiting for more context.'
      }
    ])
  })
})

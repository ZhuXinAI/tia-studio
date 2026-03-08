import { describe, expect, it, vi } from 'vitest'
import { ChannelEventBus } from './channel-event-bus'

describe('ChannelEventBus', () => {
  it('publishes inbound channel messages to subscribers', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const event = {
      eventId: 'evt-1',
      channelId: 'channel-1',
      channelType: 'lark' as const,
      message: {
        id: 'msg-1',
        remoteChatId: 'chat-1',
        senderId: 'user-1',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    }

    bus.subscribe('channel.message.received', handler)
    await bus.publish('channel.message.received', event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('publishes text outbound events to subscribers', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const event = {
      eventId: 'evt-2',
      channelId: 'channel-1',
      channelType: 'lark' as const,
      remoteChatId: 'chat-1',
      content: 'hello back',
      payload: {
        type: 'text' as const,
        text: 'hello back'
      }
    }

    bus.subscribe('channel.message.send-requested', handler)
    await bus.publish('channel.message.send-requested', event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('publishes media outbound events to subscribers', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const event = {
      eventId: 'evt-3',
      channelId: 'channel-1',
      channelType: 'lark' as const,
      remoteChatId: 'chat-1',
      payload: {
        type: 'image' as const,
        filePath: '/tmp/chart.png'
      }
    }

    bus.subscribe('channel.message.send-requested', handler)
    await bus.publish('channel.message.send-requested', event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('unsubscribes listeners', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const unsubscribe = bus.subscribe('channel.message.send-requested', handler)

    unsubscribe()

    await bus.publish('channel.message.send-requested', {
      eventId: 'evt-4',
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      content: 'ignored',
      payload: {
        type: 'file',
        filePath: '/tmp/report.pdf',
        fileName: 'report.pdf'
      }
    })

    expect(handler).not.toHaveBeenCalled()
  })
})

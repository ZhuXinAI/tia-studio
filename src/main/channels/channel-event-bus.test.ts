import { describe, expect, it, vi } from 'vitest'
import { ChannelEventBus } from './channel-event-bus'

describe('ChannelEventBus', () => {
  it('publishes text outbound events to subscribers', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const event = {
      eventId: 'evt-1',
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      payload: {
        type: 'text' as const,
        text: 'hello'
      }
    }

    bus.subscribe('channel.message.send-requested', handler)
    await bus.publish('channel.message.send-requested', event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('publishes image outbound events to subscribers', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const event = {
      eventId: 'evt-2',
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      payload: {
        type: 'image' as const,
        filePath: '/tmp/chart.png'
      }
    }

    bus.subscribe('channel.message.send-requested', handler)
    await bus.publish('channel.message.send-requested', event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('unsubscribes listeners', async () => {
    const bus = new ChannelEventBus()
    const handler = vi.fn()
    const unsubscribe = bus.subscribe('channel.message.send-requested', handler)

    unsubscribe()

    await bus.publish('channel.message.send-requested', {
      eventId: 'evt-3',
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      payload: {
        type: 'file' as const,
        filePath: '/tmp/report.pdf',
        fileName: 'report.pdf'
      }
    })

    expect(handler).not.toHaveBeenCalled()
  })
})

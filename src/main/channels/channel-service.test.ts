import { describe, expect, it, vi } from 'vitest'
import type { AppChannel } from '../persistence/repos/channels-repo'
import { AbstractChannel } from './abstract-channel'
import { ChannelEventBus } from './channel-event-bus'
import { ChannelService } from './channel-service'
import type { ChannelMessage, ChannelType } from './types'

class FakeChannel extends AbstractChannel {
  readonly startMock = vi.fn(async () => undefined)
  readonly stopMock = vi.fn(async () => undefined)
  readonly sendMock = vi.fn(async (_remoteChatId: string, _message: string) => undefined)

  constructor(id: string, type: ChannelType) {
    super(id, type)
  }

  async start(): Promise<void> {
    await this.startMock()
  }

  async stop(): Promise<void> {
    await this.stopMock()
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    await this.sendMock(remoteChatId, message)
  }

  async deliver(message: ChannelMessage): Promise<void> {
    await this.emitMessage(message)
  }
}

function createChannelRecord(overrides?: Partial<AppChannel>): AppChannel {
  return {
    id: 'channel-1',
    type: 'lark' as const,
    name: 'Lark',
    assistantId: 'assistant-1',
    enabled: true,
    config: {},
    lastError: null,
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides
  }
}

describe('ChannelService', () => {
  it('registers enabled channels and bridges inbound and outbound traffic', async () => {
    const bus = new ChannelEventBus()
    const receivedHandler = vi.fn()
    const channel = createChannelRecord()
    const adapter = new FakeChannel(channel.id, channel.type as ChannelType)
    const listEnabled = vi.fn(async () => [channel])
    const buildLarkChannel = vi.fn(async () => adapter)
    const service = new ChannelService({
      channelsRepo: {
        listEnabled
      },
      eventBus: bus,
      adapterFactories: {
        lark: buildLarkChannel
      }
    })

    bus.subscribe('channel.message.received', receivedHandler)

    await service.start()
    await adapter.deliver({
      id: 'msg-1',
      remoteChatId: 'chat-1',
      senderId: 'user-1',
      content: 'hello',
      timestamp: new Date('2026-03-08T00:00:00.000Z')
    })
    await bus.publish('channel.message.send-requested', {
      eventId: 'evt-2',
      channelId: channel.id,
      channelType: channel.type as ChannelType,
      remoteChatId: 'chat-1',
      content: 'reply'
    })

    expect(listEnabled).toHaveBeenCalledOnce()
    expect(buildLarkChannel).toHaveBeenCalledWith(channel)
    expect(adapter.startMock).toHaveBeenCalledOnce()
    expect(receivedHandler).toHaveBeenCalledWith({
      eventId: expect.any(String),
      channelId: 'channel-1',
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'chat-1',
        senderId: 'user-1',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })
    expect(adapter.sendMock).toHaveBeenCalledWith('chat-1', 'reply')
  })

  it('stops current adapters and recreates them on reload', async () => {
    const bus = new ChannelEventBus()
    const channel = createChannelRecord()
    const firstAdapter = new FakeChannel(channel.id, channel.type as ChannelType)
    const secondAdapter = new FakeChannel(channel.id, channel.type as ChannelType)
    const listEnabled = vi.fn(async () => [channel])
    const buildLarkChannel = vi
      .fn<(_: AppChannel) => Promise<FakeChannel>>()
      .mockResolvedValueOnce(firstAdapter)
      .mockResolvedValueOnce(secondAdapter)
    const service = new ChannelService({
      channelsRepo: {
        listEnabled
      },
      eventBus: bus,
      adapterFactories: {
        lark: buildLarkChannel
      }
    })

    await service.start()
    await service.reload()
    await service.stop()

    expect(listEnabled).toHaveBeenCalledTimes(2)
    expect(firstAdapter.startMock).toHaveBeenCalledOnce()
    expect(firstAdapter.stopMock).toHaveBeenCalledOnce()
    expect(secondAdapter.startMock).toHaveBeenCalledOnce()
    expect(secondAdapter.stopMock).toHaveBeenCalledOnce()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { AppChannel } from '../persistence/repos/channels-repo'
import { AbstractChannel } from './abstract-channel'
import { ChannelEventBus } from './channel-event-bus'
import { ChannelService } from './channel-service'
import type { ChannelMessage, ChannelType } from './types'

class FakeChannel extends AbstractChannel {
  readonly startMock = vi.fn(async () => undefined)
  readonly stopMock = vi.fn(async () => undefined)
  readonly sendMock = vi.fn(async (remoteChatId: string, message: string) => {
    void remoteChatId
    void message
    return undefined
  })

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
  it('registers runtime-enabled channels and bridges inbound and outbound traffic', async () => {
    const bus = new ChannelEventBus()
    const receivedHandler = vi.fn()
    const channel = createChannelRecord()
    const adapter = new FakeChannel(channel.id, channel.type as ChannelType)
    const listRuntimeEnabled = vi.fn(async () => [channel])
    const setLastError = vi.fn(async () => null)
    const buildLarkChannel = vi.fn(async () => adapter)
    const service = new ChannelService({
      channelsRepo: {
        listRuntimeEnabled,
        setLastError
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

    expect(listRuntimeEnabled).toHaveBeenCalledOnce()
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
    const listRuntimeEnabled = vi.fn(async () => [channel])
    const setLastError = vi.fn(async () => null)
    const buildLarkChannel = vi
      .fn<(_: AppChannel) => Promise<FakeChannel>>()
      .mockResolvedValueOnce(firstAdapter)
      .mockResolvedValueOnce(secondAdapter)
    const service = new ChannelService({
      channelsRepo: {
        listRuntimeEnabled,
        setLastError
      },
      eventBus: bus,
      adapterFactories: {
        lark: buildLarkChannel
      }
    })

    await service.start()
    await service.reload()
    await service.stop()

    expect(listRuntimeEnabled).toHaveBeenCalledTimes(2)
    expect(firstAdapter.startMock).toHaveBeenCalledOnce()
    expect(firstAdapter.stopMock).toHaveBeenCalledOnce()
    expect(secondAdapter.startMock).toHaveBeenCalledOnce()
    expect(secondAdapter.stopMock).toHaveBeenCalledOnce()
  })

  it('continues startup when one adapter fails and records channel health', async () => {
    const bus = new ChannelEventBus()
    const failedChannel = createChannelRecord({
      id: 'channel-failed',
      type: 'telegram',
      lastError: 'Stale error'
    })
    const healthyChannel = createChannelRecord({
      id: 'channel-healthy',
      type: 'lark',
      lastError: 'Previous outage'
    })
    const failedAdapter = new FakeChannel(failedChannel.id, 'telegram')
    const healthyAdapter = new FakeChannel(healthyChannel.id, 'lark')
    failedAdapter.startMock.mockRejectedValue(new Error('Bad credentials'))

    const listRuntimeEnabled = vi.fn(async () => [failedChannel, healthyChannel])
    const setLastError = vi.fn(async () => null)
    const service = new ChannelService({
      channelsRepo: {
        listRuntimeEnabled,
        setLastError
      },
      eventBus: bus,
      adapterFactories: {
        telegram: async () => failedAdapter,
        lark: async () => healthyAdapter
      },
      startTimeoutMs: 50
    })

    await service.start()

    await bus.publish('channel.message.send-requested', {
      eventId: 'evt-failed',
      channelId: failedChannel.id,
      channelType: 'telegram',
      remoteChatId: 'chat-failed',
      content: 'reply'
    })
    await bus.publish('channel.message.send-requested', {
      eventId: 'evt-healthy',
      channelId: healthyChannel.id,
      channelType: 'lark',
      remoteChatId: 'chat-healthy',
      content: 'reply'
    })

    expect(failedAdapter.startMock).toHaveBeenCalledOnce()
    expect(healthyAdapter.startMock).toHaveBeenCalledOnce()
    expect(setLastError).toHaveBeenCalledWith(failedChannel.id, 'Bad credentials')
    expect(setLastError).toHaveBeenCalledWith(healthyChannel.id, null)
    expect(failedAdapter.sendMock).not.toHaveBeenCalled()
    expect(healthyAdapter.sendMock).toHaveBeenCalledWith('chat-healthy', 'reply')
  })

  it('times out a hanging adapter startup instead of hanging the app', async () => {
    vi.useFakeTimers()

    try {
      const bus = new ChannelEventBus()
      const hangingChannel = createChannelRecord({
        id: 'channel-hanging',
        type: 'telegram'
      })
      const healthyChannel = createChannelRecord({
        id: 'channel-healthy',
        type: 'lark'
      })
      const hangingAdapter = new FakeChannel(hangingChannel.id, 'telegram')
      const healthyAdapter = new FakeChannel(healthyChannel.id, 'lark')
      hangingAdapter.startMock.mockImplementation(() => new Promise(() => undefined))

      const listRuntimeEnabled = vi.fn(async () => [hangingChannel, healthyChannel])
      const setLastError = vi.fn(async () => null)
      const service = new ChannelService({
        channelsRepo: {
          listRuntimeEnabled,
          setLastError
        },
        eventBus: bus,
        adapterFactories: {
          telegram: async () => hangingAdapter,
          lark: async () => healthyAdapter
        },
        startTimeoutMs: 50
      })

      const startPromise = service.start().then(() => 'resolved')

      await vi.advanceTimersByTimeAsync(50)

      await expect(Promise.race([startPromise, Promise.resolve('pending')])).resolves.toBe(
        'resolved'
      )
      expect(setLastError).toHaveBeenCalledWith(
        hangingChannel.id,
        expect.stringContaining('timed out')
      )
      expect(healthyAdapter.startMock).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

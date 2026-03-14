import { describe, expect, it, vi } from 'vitest'
import type { RelayClientEventMap } from 'wechat-kf-relay'
import {
  WechatKfChannel,
  buildWechatKfRemoteChatId,
  parseWechatKfRemoteChatId
} from './wechat-kf-channel'

class RelayClientStub {
  readonly connect = vi.fn(() => undefined)
  readonly disconnect = vi.fn(() => undefined)
  readonly syncNow = vi.fn(() => undefined)
  readonly sendText = vi.fn(() => undefined)
  readonly messageOnEvent = vi.fn(() => undefined)

  private readonly handlers = new Map<string, Set<(payload: unknown) => void>>()

  on<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void
  ): this {
    const handlers = this.handlers.get(eventName) ?? new Set()
    handlers.add(listener as (payload: unknown) => void)
    this.handlers.set(eventName, handlers)
    return this
  }

  once<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void
  ): this {
    const wrapped = (payload: RelayClientEventMap[EventName]) => {
      this.off(eventName, wrapped)
      listener(payload)
    }

    return this.on(eventName, wrapped)
  }

  off<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void
  ): this {
    const handlers = this.handlers.get(eventName)
    handlers?.delete(listener as (payload: unknown) => void)
    return this
  }

  emit<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    payload: RelayClientEventMap[EventName]
  ): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(payload)
    }
  }
}

describe('WechatKfChannel', () => {
  it('maps an inbound relay text message into the shared channel contract', () => {
    const client = new RelayClientStub()
    const channel = new WechatKfChannel({
      id: 'channel-wechat-kf',
      serverUrl: 'ws://127.0.0.1:3000/ws',
      serverKey: 'server-key',
      clientFactory: () => client
    })

    const message = channel['toChannelMessage']({
      message_id: 'msg-1',
      open_kfid: 'wkf-1',
      external_userid: 'wm-user-1',
      send_time: 1_773_187_200,
      origin: 3,
      msgtype: 'text',
      text: {
        content: ' hello from wechat '
      },
      raw: {
        msgid: 'msg-1'
      }
    })

    expect(parseWechatKfRemoteChatId(message?.remoteChatId ?? '')).toEqual({
      openKfId: 'wkf-1',
      externalUserId: 'wm-user-1'
    })
    expect(message).toMatchObject({
      id: 'msg-1',
      senderId: 'wm-user-1',
      content: 'hello from wechat',
      metadata: {
        wechatKfMessageId: 'msg-1',
        wechatKfOpenKfId: 'wkf-1',
        wechatKfExternalUserId: 'wm-user-1',
        wechatKfOrigin: 3,
        wechatKfMessageType: 'text'
      }
    })
    expect(message?.timestamp.toISOString()).toBe('2026-03-11T00:00:00.000Z')
  })

  it('waits for relay authentication and triggers an initial sync', async () => {
    const client = new RelayClientStub()
    const channel = new WechatKfChannel({
      id: 'channel-wechat-kf',
      serverUrl: 'ws://127.0.0.1:3000/ws',
      serverKey: 'server-key',
      clientFactory: () => client
    })

    let resolved = false
    const startPromise = channel.start().then(() => {
      resolved = true
    })

    await Promise.resolve()

    expect(client.connect).toHaveBeenCalledOnce()
    expect(resolved).toBe(false)

    client.emit('authenticated', {
      client_id: 'client-1',
      ws_path: '/ws'
    })

    await startPromise

    expect(client.syncNow).toHaveBeenCalledOnce()
  })

  it('sends outbound messages through the relay client and strips channel break markers', async () => {
    const client = new RelayClientStub()
    const channel = new WechatKfChannel({
      id: 'channel-wechat-kf',
      serverUrl: 'ws://127.0.0.1:3000/ws',
      serverKey: 'server-key',
      clientFactory: () => client
    })

    await channel.send(
      buildWechatKfRemoteChatId({
        openKfId: 'wkf-1',
        externalUserId: 'wm-user-1'
      }),
      'First[[BR]]Second'
    )

    expect(client.sendText).toHaveBeenCalledWith({
      open_kfid: 'wkf-1',
      external_userid: 'wm-user-1',
      content: 'First\nSecond'
    })
  })

  it('forwards steady-state relay errors to the fatal error handler', async () => {
    const client = new RelayClientStub()
    const onFatalError = vi.fn(async () => undefined)
    const channel = new WechatKfChannel({
      id: 'channel-wechat-kf',
      serverUrl: 'ws://127.0.0.1:3000/ws',
      serverKey: 'server-key',
      clientFactory: () => client,
      onFatalError
    })

    const startPromise = channel.start()
    client.emit('authenticated', {
      client_id: 'client-1',
      ws_path: '/ws'
    })
    await startPromise

    client.emit('relay.error', {
      error: 'Relay failed'
    })

    await Promise.resolve()

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Relay failed' }))
  })
})

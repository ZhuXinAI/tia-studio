import { describe, expect, it, vi } from 'vitest'
import { WeComChannel } from './wecom-channel'

function createSdkStub() {
  const handlers = new Map<string, (payload: unknown) => void>()
  const connect = vi.fn(() => undefined)
  const disconnect = vi.fn(() => undefined)
  const sendMessage = vi.fn(async () => undefined)
  const on = vi.fn((event: string, handler: (payload: unknown) => void) => {
    handlers.set(event, handler)
    return clientInstance
  })
  const clientInstance = {
    on,
    connect,
    disconnect,
    sendMessage
  }
  const wsClientCtor = vi.fn(function WSClientMock() {
    return clientInstance
  })

  return {
    sdk: {
      WSClient: wsClientCtor
    },
    wsClientCtor,
    connect,
    disconnect,
    sendMessage,
    emit(event: string, payload: unknown) {
      handlers.get(event)?.(payload)
    }
  }
}

describe('WeComChannel', () => {
  it('maps an inbound text message into the shared channel contract', () => {
    const sdkStub = createSdkStub()
    const channel = new WeComChannel({
      id: 'channel-wecom',
      botId: 'bot-123',
      secret: 'secret-123',
      sdk: sdkStub.sdk
    })

    const message = channel['toChannelMessage']({
      body: {
        msgid: 'msg-1',
        chattype: 'single',
        from: {
          userid: 'user-1'
        },
        create_time: 1_773_187_200,
        msgtype: 'text',
        text: {
          content: 'hello from wecom'
        }
      }
    })

    expect(message).toMatchObject({
      id: 'msg-1',
      remoteChatId: 'user-1',
      senderId: 'user-1',
      content: 'hello from wecom',
      metadata: {
        wecomChatId: null,
        wecomChatType: 'single',
        wecomMessageId: 'msg-1'
      }
    })
    expect(message?.timestamp.toISOString()).toBe('2026-03-11T00:00:00.000Z')
  })

  it('connects with botId and secret on start', async () => {
    const sdkStub = createSdkStub()
    const channel = new WeComChannel({
      id: 'channel-wecom',
      botId: 'bot-123',
      secret: 'secret-123',
      sdk: sdkStub.sdk
    })

    await channel.start()

    expect(sdkStub.wsClientCtor).toHaveBeenCalledWith({
      botId: 'bot-123',
      secret: 'secret-123'
    })
    expect(sdkStub.connect).toHaveBeenCalledOnce()
  })

  it('sends outbound messages as markdown over the sdk client', async () => {
    const sdkStub = createSdkStub()
    const channel = new WeComChannel({
      id: 'channel-wecom',
      botId: 'bot-123',
      secret: 'secret-123',
      sdk: sdkStub.sdk
    })

    await channel.send('chat-1', 'reply from tia')

    expect(sdkStub.sendMessage).toHaveBeenCalledWith('chat-1', {
      msgtype: 'markdown',
      markdown: {
        content: 'reply from tia'
      }
    })
  })

  it('forwards sdk error events to the fatal-error callback while running', async () => {
    const sdkStub = createSdkStub()
    const onFatalError = vi.fn(async () => undefined)
    const channel = new WeComChannel({
      id: 'channel-wecom',
      botId: 'bot-123',
      secret: 'secret-123',
      sdk: sdkStub.sdk,
      onFatalError
    })

    await channel.start()
    sdkStub.emit('error', new Error('Auth failed'))

    await Promise.resolve()

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Auth failed' }))
  })

  it('disconnects on stop and ignores later sdk errors', async () => {
    const sdkStub = createSdkStub()
    const onFatalError = vi.fn(async () => undefined)
    const channel = new WeComChannel({
      id: 'channel-wecom',
      botId: 'bot-123',
      secret: 'secret-123',
      sdk: sdkStub.sdk,
      onFatalError
    })

    await channel.start()
    await channel.stop()
    sdkStub.emit('error', new Error('Disconnected'))

    await Promise.resolve()

    expect(sdkStub.disconnect).toHaveBeenCalledOnce()
    expect(onFatalError).not.toHaveBeenCalled()
  })
})

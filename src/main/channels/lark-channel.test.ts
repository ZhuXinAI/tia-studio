import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LarkChannel } from './lark-channel'

function createSdkStub() {
  const imageCreate = vi.fn(async () => ({
    image_key: 'img_uploaded_123'
  }))
  const messageCreate = vi.fn(async () => undefined)
  const messageReactionCreate = vi.fn(async () => undefined)
  const request = vi.fn(async () => ({
    code: 0,
    bot: {
      open_id: 'ou_bot_123'
    }
  }))
  const clientInstance = {
    im: {
      v1: {
        image: {
          create: imageCreate
        },
        message: {
          create: messageCreate
        },
        messageReaction: {
          create: messageReactionCreate
        }
      }
    },
    request
  }
  const wsStart = vi.fn(async () => undefined)
  const wsClose = vi.fn(() => undefined)
  const wsInstance = {
    start: wsStart,
    close: wsClose
  }
  let registeredHandlers: Record<string, (event: unknown) => Promise<void> | void> = {}
  const register = vi.fn((handlers: Record<string, (event: unknown) => Promise<void> | void>) => {
    registeredHandlers = handlers
  })
  const eventDispatcherInstance = {
    register
  }
  const clientCtor = vi.fn(function ClientMock() {
    return clientInstance
  })
  const wsClientCtor = vi.fn(function WSClientMock() {
    return wsInstance
  })
  const eventDispatcherCtor = vi.fn(function EventDispatcherMock() {
    return eventDispatcherInstance
  })

  return {
    sdk: {
      Client: clientCtor,
      WSClient: wsClientCtor,
      EventDispatcher: eventDispatcherCtor,
      LoggerLevel: {
        fatal: 'fatal'
      }
    },
    clientCtor,
    wsClientCtor,
    eventDispatcherCtor,
    eventDispatcherInstance,
    wsStart,
    wsClose,
    imageCreate,
    messageCreate,
    messageReactionCreate,
    request,
    getRegisteredHandlers: () => registeredHandlers
  }
}

function createMessageEvent(overrides?: Record<string, unknown>) {
  const defaultTimestamp = String(Date.now())

  return {
    create_time: defaultTimestamp,
    sender: {
      sender_id: {
        user_id: 'user-1'
      },
      sender_type: 'user'
    },
    message: {
      message_id: 'om_456',
      chat_id: 'oc_123',
      thread_id: 'omt_789',
      create_time: defaultTimestamp,
      chat_type: 'p2p',
      message_type: 'text',
      content: JSON.stringify({
        text: 'hello from lark'
      })
    },
    ...overrides
  }
}

describe('LarkChannel', () => {
  it('converts a Lark message event to the shared channel contract', () => {
    const sdkStub = createSdkStub()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })

    const message = channel['toChannelMessage'](
      createMessageEvent({
        create_time: String(new Date('2026-03-08T00:00:00.000Z').getTime()),
        message: {
          message_id: 'om_456',
          chat_id: 'oc_123',
          thread_id: 'omt_789',
          create_time: String(new Date('2026-03-08T00:00:00.000Z').getTime()),
          chat_type: 'p2p',
          message_type: 'text',
          content: JSON.stringify({
            text: 'hello from lark'
          })
        }
      })
    )

    expect(message).toMatchObject({
      id: 'om_456',
      remoteChatId: 'oc_123',
      senderId: 'user-1',
      content: 'hello from lark',
      metadata: {
        larkChatId: 'oc_123',
        larkMessageId: 'om_456',
        larkThreadId: 'omt_789'
      }
    })
    expect(message?.timestamp.toISOString()).toBe('2026-03-08T00:00:00.000Z')
  })

  it('starts the websocket client with the provided credentials', async () => {
    const sdkStub = createSdkStub()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })

    await channel.start()

    expect(sdkStub.clientCtor).toHaveBeenCalledWith({
      appId: 'cli_xxx',
      appSecret: 'secret',
      loggerLevel: 'fatal'
    })
    expect(sdkStub.wsClientCtor).toHaveBeenCalledWith({
      appId: 'cli_xxx',
      appSecret: 'secret',
      loggerLevel: 'fatal'
    })
    expect(sdkStub.eventDispatcherCtor).toHaveBeenCalledWith({
      loggerLevel: 'fatal'
    })
    expect(sdkStub.eventDispatcherInstance.register).toHaveBeenCalledWith(
      expect.objectContaining({
        'im.message.receive_v1': expect.any(Function)
      })
    )
    expect(sdkStub.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/open-apis/bot/v3/info'
    })
    expect(sdkStub.wsStart).toHaveBeenCalledWith({
      eventDispatcher: sdkStub.eventDispatcherInstance
    })
  })

  it('sends a text reply back to the same Lark chat', async () => {
    const sdkStub = createSdkStub()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })

    await channel.send('oc_123', 'reply from tia')

    expect(sdkStub.messageCreate).toHaveBeenCalledWith({
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: 'oc_123',
        msg_type: 'text',
        content: JSON.stringify({
          text: 'reply from tia'
        })
      }
    })
  })

  it('uploads an image and sends the returned image key back to the same Lark chat', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'tia-lark-image-'))
    const imagePath = path.join(tempDir, 'reply.png')
    try {
      await writeFile(imagePath, Buffer.from('fake-image'))

      const sdkStub = createSdkStub()
      const channel = new LarkChannel({
        id: 'channel-lark',
        appId: 'cli_xxx',
        appSecret: 'secret',
        sdk: sdkStub.sdk
      })

      await channel.sendImage?.('oc_123', imagePath)

      expect(sdkStub.imageCreate).toHaveBeenCalledWith({
        data: {
          image_type: 'message',
          image: expect.any(Buffer)
        }
      })
      expect(sdkStub.messageCreate).toHaveBeenCalledWith({
        params: {
          receive_id_type: 'chat_id'
        },
        data: {
          receive_id: 'oc_123',
          msg_type: 'image',
          content: JSON.stringify({
            image_key: 'img_uploaded_123'
          })
        }
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('acknowledges a received message with a Lark reaction', async () => {
    const sdkStub = createSdkStub()
    const handler = vi.fn()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    await receiveHandler?.(createMessageEvent())

    expect(sdkStub.messageReactionCreate).toHaveBeenCalledWith({
      path: { message_id: 'om_456' },
      data: { reaction_type: { emoji_type: 'Get' } }
    })
    expect(handler).toHaveBeenCalled()
  })

  it('still emits the message even if acknowledgeMessage fails', async () => {
    const sdkStub = createSdkStub()
    sdkStub.messageReactionCreate.mockRejectedValue(new Error('reaction failed'))
    const handler = vi.fn()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    await receiveHandler?.(createMessageEvent())

    expect(handler).toHaveBeenCalled()
  })

  it('returns from the receive handler before downstream processing finishes', async () => {
    const sdkStub = createSdkStub()
    let resolveHandler: (() => void) | undefined
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve
        })
    )
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    if (!receiveHandler) {
      throw new Error('expected lark receive handler to be registered')
    }

    const receivePromise = Promise.resolve(receiveHandler(createMessageEvent()))
    const result = await Promise.race([
      receivePromise.then(() => 'resolved'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 10))
    ])

    expect(result).toBe('resolved')
    expect(handler).toHaveBeenCalled()

    resolveHandler?.()
    await receivePromise
  })

  it('does not reject the receive handler when downstream processing fails', async () => {
    const sdkStub = createSdkStub()
    const handler = vi.fn(async () => {
      throw new Error('downstream failed')
    })
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    if (!receiveHandler) {
      throw new Error('expected lark receive handler to be registered')
    }

    await expect(receiveHandler(createMessageEvent())).resolves.toBeUndefined()
    expect(handler).toHaveBeenCalled()
  })

  it('ignores stale inbound messages older than 30 seconds', async () => {
    vi.useFakeTimers()

    try {
      vi.setSystemTime(new Date('2026-03-08T00:00:31.000Z'))

      const sdkStub = createSdkStub()
      const handler = vi.fn()
      const channel = new LarkChannel({
        id: 'channel-lark',
        appId: 'cli_xxx',
        appSecret: 'secret',
        sdk: sdkStub.sdk
      })
      channel.onMessage = handler

      await channel.start()

      const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
      await receiveHandler?.(
        createMessageEvent({
          create_time: String(new Date('2026-03-08T00:00:00.000Z').getTime()),
          message: {
            message_id: 'om_456',
            chat_id: 'oc_123',
            thread_id: 'omt_789',
            create_time: String(new Date('2026-03-08T00:00:00.000Z').getTime()),
            chat_type: 'p2p',
            message_type: 'text',
            content: JSON.stringify({
              text: 'hello from lark'
            })
          }
        })
      )

      expect(handler).not.toHaveBeenCalled()
      expect(sdkStub.messageReactionCreate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores unsupported non-text inbound payloads', async () => {
    const sdkStub = createSdkStub()
    const handler = vi.fn()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    await receiveHandler?.(
      createMessageEvent({
        message: {
          message_id: 'om_image',
          chat_id: 'oc_123',
          create_time: String(new Date('2026-03-08T00:00:00.000Z').getTime()),
          chat_type: 'p2p',
          message_type: 'image',
          content: JSON.stringify({
            image_key: 'img_123'
          })
        }
      })
    )

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores group messages without a bot mention by default', async () => {
    const sdkStub = createSdkStub()
    const handler = vi.fn()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    await receiveHandler?.(
      createMessageEvent({
        message: {
          message_id: 'om_group_1',
          chat_id: 'oc_group_1',
          thread_id: 'omt_789',
          create_time: String(Date.now()),
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({
            text: 'hello group'
          }),
          mentions: []
        }
      })
    )

    expect(handler).not.toHaveBeenCalled()
  })

  it('forwards group messages when the bot is mentioned', async () => {
    const sdkStub = createSdkStub()
    const handler = vi.fn()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    await receiveHandler?.(
      createMessageEvent({
        message: {
          message_id: 'om_group_2',
          chat_id: 'oc_group_1',
          thread_id: 'omt_789',
          create_time: String(Date.now()),
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({
            text: '@tia hello group'
          }),
          mentions: [
            {
              id: {
                open_id: 'ou_bot_123'
              }
            }
          ]
        }
      })
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'om_group_2',
        remoteChatId: 'oc_group_1',
        content: '@tia hello group',
        metadata: expect.objectContaining({
          larkChatType: 'group',
          larkIsBotMentioned: true
        })
      })
    )
  })

  it('can allow every group message when mention gating is disabled', async () => {
    const sdkStub = createSdkStub()
    const handler = vi.fn()
    const channel = new LarkChannel({
      id: 'channel-lark',
      appId: 'cli_xxx',
      appSecret: 'secret',
      sdk: sdkStub.sdk,
      groupRequireMention: false
    })
    channel.onMessage = handler

    await channel.start()

    const receiveHandler = sdkStub.getRegisteredHandlers()['im.message.receive_v1']
    await receiveHandler?.(
      createMessageEvent({
        message: {
          message_id: 'om_group_3',
          chat_id: 'oc_group_1',
          thread_id: 'omt_789',
          create_time: String(Date.now()),
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({
            text: 'plain group hello'
          }),
          mentions: []
        }
      })
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'om_group_3',
        remoteChatId: 'oc_group_1',
        content: 'plain group hello',
        metadata: expect.objectContaining({
          larkChatType: 'group',
          larkIsBotMentioned: false
        })
      })
    )
  })
})

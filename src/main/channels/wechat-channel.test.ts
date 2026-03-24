import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WechatChannel,
  type WechatChannelOptions
} from './wechat-channel'
import { WechatAuthStateStore } from './wechat-auth-state-store'

describe('WechatChannel', () => {
  let dataDirectoryPath: string

  beforeEach(async () => {
    dataDirectoryPath = await mkdtemp(join(tmpdir(), 'tia-wechat-channel-'))
  })

  afterEach(async () => {
    await rm(dataDirectoryPath, { recursive: true, force: true }).catch(() => undefined)
  })

  async function createChannel(
    overrides: Partial<WechatChannelOptions> = {}
  ): Promise<{
    channel: WechatChannel
    authStateStore: WechatAuthStateStore
    api: NonNullable<WechatChannelOptions['api']>
    onStateChange: ReturnType<typeof vi.fn>
  }> {
    const authStateStore = new WechatAuthStateStore({
      now: () => new Date('2026-03-24T00:00:00.000Z')
    })
    const api: NonNullable<WechatChannelOptions['api']> = {
      fetchQRCode: vi.fn(async () => ({
        qrcode: 'wechat-qr-token',
        qrcode_img_content: 'https://wechat.example/qr'
      })),
      pollQRStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: 'wait' as const })
        .mockResolvedValueOnce({
          status: 'confirmed' as const,
          bot_token: 'bot-token',
          ilink_bot_id: 'bot-id',
          ilink_user_id: 'wechat-user-1',
          baseurl: 'https://ilinkai.weixin.qq.com'
        }),
      getUpdates: vi.fn(async () => ({
        ret: 0,
        get_updates_buf: 'cursor-2',
        msgs: [
          {
            message_id: 42,
            from_user_id: 'wechat-contact-1',
            to_user_id: 'bot-id',
            create_time_ms: Date.parse('2026-03-24T00:00:00.000Z'),
            message_type: 1,
            context_token: 'ctx-1',
            item_list: [
              {
                type: 1,
                text_item: {
                  text: 'hello from wechat'
                }
              }
            ]
          }
        ]
      })),
      getConfig: vi.fn(async () => ({
        typing_ticket: 'typing-ticket'
      })),
      sendMessage: vi.fn(async () => undefined),
      sendTyping: vi.fn(async () => undefined)
    }
    const onStateChange = vi.fn(async () => undefined)
    const resolvedApi = overrides.api ?? api
    const channel = new WechatChannel({
      id: 'channel-wechat',
      dataDirectoryPath,
      authStateStore,
      api: resolvedApi,
      now: () => new Date('2026-03-24T00:00:00.000Z'),
      qrcodeToDataUrl: async (value) => `data:image/png;base64,${value}`,
      longPollTimeoutMs: 10,
      reconnectDelayMs: 10,
      onStateChange,
      ...overrides
    })

    return {
      channel,
      authStateStore,
      api: resolvedApi,
      onStateChange
    }
  }

  it('surfaces qr auth state and emits inbound messages after login confirmation', async () => {
    const { channel, authStateStore, api, onStateChange } = await createChannel()
    const onMessage = vi.fn(async () => undefined)
    channel.onMessage = onMessage

    await channel.start()

    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '42',
          remoteChatId: 'wechat-contact-1',
          senderId: 'wechat-contact-1',
          content: 'hello from wechat'
        })
      )
    })

    expect(authStateStore.get('channel-wechat')).toMatchObject({
      status: 'connected',
      accountId: 'wechat-user-1'
    })
    expect(api.fetchQRCode).toHaveBeenCalledOnce()
    expect(api.pollQRStatus).toHaveBeenCalledTimes(2)
    expect(api.getUpdates).toHaveBeenCalled()
    expect(onStateChange).toHaveBeenCalledWith({
      status: 'qr_ready',
      errorMessage: null
    })
    expect(onStateChange).toHaveBeenCalledWith({
      status: 'connected',
      errorMessage: null
    })

    await channel.stop()
  })

  it('sends outbound messages with the saved conversation context token', async () => {
    const api: NonNullable<WechatChannelOptions['api']> = {
      fetchQRCode: vi.fn(async () => ({
        qrcode: 'wechat-qr-token',
        qrcode_img_content: 'https://wechat.example/qr'
      })),
      pollQRStatus: vi.fn(async () => ({
        status: 'confirmed' as const,
        bot_token: 'bot-token',
        ilink_bot_id: 'bot-id',
        ilink_user_id: 'wechat-user-1',
        baseurl: 'https://ilinkai.weixin.qq.com'
      })),
      getUpdates: vi.fn(async () => ({
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [
          {
            message_id: 42,
            from_user_id: 'wechat-contact-1',
            to_user_id: 'bot-id',
            create_time_ms: Date.parse('2026-03-24T00:00:00.000Z'),
            message_type: 1,
            context_token: 'ctx-1',
            item_list: [
              {
                type: 1,
                text_item: {
                  text: 'hello from wechat'
                }
              }
            ]
          }
        ]
      })),
      getConfig: vi.fn(async () => ({
        typing_ticket: 'typing-ticket'
      })),
      sendMessage: vi.fn(async () => undefined),
      sendTyping: vi.fn(async () => undefined)
    }

    const { channel } = await createChannel({
      api
    })

    await channel.start()

    await vi.waitFor(() => {
      expect(api.getUpdates).toHaveBeenCalled()
    })

    await channel.send('wechat-contact-1', 'reply from tia')

    expect(api.sendMessage).toHaveBeenCalledWith({
      baseUrl: 'https://ilinkai.weixin.qq.com',
      token: 'bot-token',
      body: {
        msg: expect.objectContaining({
          to_user_id: 'wechat-contact-1',
          context_token: 'ctx-1',
          item_list: [
            {
              type: 1,
              text_item: {
                text: 'reply from tia'
              }
            }
          ]
        })
      }
    })

    await channel.stop()
  })

  it('clears stored auth and falls back to disconnected when the server rejects the saved token', async () => {
    const api: NonNullable<WechatChannelOptions['api']> = {
      fetchQRCode: vi.fn(async () => ({
        qrcode: 'wechat-qr-token',
        qrcode_img_content: 'https://wechat.example/qr'
      })),
      pollQRStatus: vi.fn(async () => ({
        status: 'confirmed' as const,
        bot_token: 'bot-token',
        ilink_bot_id: 'bot-id',
        ilink_user_id: 'wechat-user-1',
        baseurl: 'https://ilinkai.weixin.qq.com'
      })),
      getUpdates: vi
        .fn()
        .mockResolvedValueOnce({
          ret: 0,
          get_updates_buf: 'cursor-1',
          msgs: []
        })
        .mockRejectedValueOnce(new Error('getUpdates 401: unauthorized')),
      getConfig: vi.fn(async () => ({
        typing_ticket: 'typing-ticket'
      })),
      sendMessage: vi.fn(async () => undefined),
      sendTyping: vi.fn(async () => undefined)
    }

    const { channel, authStateStore, onStateChange } = await createChannel({
      api,
      reconnectDelayMs: 1_000_000
    })

    await channel.start()

    await vi.waitFor(() => {
      expect(authStateStore.get('channel-wechat')).toMatchObject({
        status: 'disconnected'
      })
    })

    expect(onStateChange).toHaveBeenCalledWith({
      status: 'disconnected',
      errorMessage: null
    })

    await channel.stop()
  })

  it('sends typing indicators for inbound messages and clears them after replying', async () => {
    const api: NonNullable<WechatChannelOptions['api']> = {
      fetchQRCode: vi.fn(async () => ({
        qrcode: 'wechat-qr-token',
        qrcode_img_content: 'https://wechat.example/qr'
      })),
      pollQRStatus: vi.fn(async () => ({
        status: 'confirmed' as const,
        bot_token: 'bot-token',
        ilink_bot_id: 'bot-id',
        ilink_user_id: 'wechat-user-1',
        baseurl: 'https://ilinkai.weixin.qq.com'
      })),
      getUpdates: vi.fn(async () => ({
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [
          {
            message_id: 42,
            from_user_id: 'wechat-contact-1',
            to_user_id: 'bot-id',
            create_time_ms: Date.parse('2026-03-24T00:00:00.000Z'),
            message_type: 1,
            context_token: 'ctx-1',
            item_list: [
              {
                type: 1,
                text_item: {
                  text: 'hello from wechat'
                }
              }
            ]
          }
        ]
      })),
      getConfig: vi.fn(async () => ({
        typing_ticket: 'typing-ticket'
      })),
      sendMessage: vi.fn(async () => undefined),
      sendTyping: vi.fn(async () => undefined)
    }

    const { channel } = await createChannel({ api })
    channel.onMessage = vi.fn(async () => undefined)

    await channel.start()

    await vi.waitFor(() => {
      expect(api.sendTyping).toHaveBeenCalledWith({
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'bot-token',
        body: {
          ilink_user_id: 'wechat-contact-1',
          typing_ticket: 'typing-ticket',
          status: 1
        },
        signal: expect.any(AbortSignal)
      })
    })

    await channel.send('wechat-contact-1', 'reply from tia')

    await vi.waitFor(() => {
      expect(api.sendTyping).toHaveBeenCalledWith({
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'bot-token',
        body: {
          ilink_user_id: 'wechat-contact-1',
          typing_ticket: 'typing-ticket',
          status: 2
        },
        signal: undefined
      })
    })

    await channel.stop()
  })
})

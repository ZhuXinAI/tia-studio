import { describe, expect, it, vi } from 'vitest'
import type { DiscordClientLike, DiscordInboundTextMessage } from './discord-channel'
import { DiscordChannel } from './discord-channel'

function createClientStub() {
  let textHandler: (message: DiscordInboundTextMessage) => Promise<void> = async () => undefined
  let errorHandler: (error: Error) => Promise<void> | void = () => undefined

  const connect = vi.fn(async () => undefined)
  const disconnect = vi.fn(async () => undefined)
  const sendMessage = vi.fn(async () => undefined)
  const sendImage = vi.fn(async () => undefined)
  const sendFile = vi.fn(async () => undefined)

  return {
    client: {
      onText(handler: (message: DiscordInboundTextMessage) => Promise<void>) {
        textHandler = handler
      },
      onError(handler: (error: Error) => Promise<void> | void) {
        errorHandler = handler
      },
      connect,
      disconnect,
      sendMessage,
      sendImage,
      sendFile
    } satisfies DiscordClientLike,
    connect,
    disconnect,
    sendMessage,
    sendImage,
    sendFile,
    async emitText(message: DiscordInboundTextMessage) {
      await textHandler(message)
    },
    emitError(error: Error) {
      return errorHandler(error)
    }
  }
}

describe('DiscordChannel', () => {
  it('maps a DM into the shared channel contract', () => {
    const clientStub = createClientStub()
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client
    })

    const message = channel['toChannelMessage']({
      id: 'msg-1',
      channelId: 'dm-1',
      chatType: 'dm',
      guildId: null,
      senderId: 'user-1',
      senderUsername: 'casey',
      senderDisplayName: 'Casey',
      text: 'hello from discord',
      timestamp: new Date('2026-03-17T00:00:00.000Z'),
      isBotMentioned: false
    })

    expect(message).toMatchObject({
      id: 'msg-1',
      remoteChatId: 'dm-1',
      senderId: 'user-1',
      content: 'hello from discord',
      metadata: {
        discordChannelId: 'dm-1',
        discordChannelType: 'dm',
        discordGuildId: null,
        discordIsBotMentioned: true,
        discordMessageId: 'msg-1',
        discordUsername: 'casey',
        discordDisplayName: 'Casey'
      }
    })
    expect(message?.timestamp.toISOString()).toBe('2026-03-17T00:00:00.000Z')
  })

  it('connects with the provided token on start', async () => {
    const clientStub = createClientStub()
    const clientFactory = vi.fn(async () => clientStub.client)
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      clientFactory
    })

    await channel.start()

    expect(clientFactory).toHaveBeenCalledWith('discord-token')
    expect(clientStub.connect).toHaveBeenCalledOnce()
  })

  it('sends outbound text, image, and file replies through the client', async () => {
    const clientStub = createClientStub()
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client
    })

    await channel.start()
    await channel.send('channel-1', 'reply from tia')
    await channel.sendImage?.('channel-1', '/tmp/chart.png')
    await channel.sendFile?.('channel-1', '/tmp/report.pdf', 'report.pdf')

    expect(clientStub.sendMessage).toHaveBeenCalledWith('channel-1', 'reply from tia')
    expect(clientStub.sendImage).toHaveBeenCalledWith('channel-1', '/tmp/chart.png')
    expect(clientStub.sendFile).toHaveBeenCalledWith('channel-1', '/tmp/report.pdf', 'report.pdf')
  })

  it('forwards client error events to the fatal-error callback while running', async () => {
    const clientStub = createClientStub()
    const onFatalError = vi.fn(async () => undefined)
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client,
      onFatalError
    })

    await channel.start()
    await clientStub.emitError(new Error('Auth failed'))

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Auth failed' }))
  })

  it('disconnects on stop and ignores later client errors', async () => {
    const clientStub = createClientStub()
    const onFatalError = vi.fn(async () => undefined)
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client,
      onFatalError
    })

    await channel.start()
    await channel.stop()
    await clientStub.emitError(new Error('Disconnected'))

    expect(clientStub.disconnect).toHaveBeenCalledWith('discord-channel-stopped')
    expect(onFatalError).not.toHaveBeenCalled()
  })

  it('ignores guild messages without a bot mention by default', () => {
    const clientStub = createClientStub()
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client
    })

    const message = channel['toChannelMessage']({
      id: 'msg-guild-1',
      channelId: 'guild-channel-1',
      chatType: 'guild',
      guildId: 'guild-1',
      senderId: 'user-1',
      senderUsername: 'casey',
      senderDisplayName: 'Casey',
      text: 'hello guild',
      timestamp: new Date('2026-03-17T00:00:00.000Z'),
      isBotMentioned: false
    })

    expect(message).toBeNull()
  })

  it('forwards guild messages when the bot is mentioned', async () => {
    const clientStub = createClientStub()
    const handler = vi.fn()
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client
    })
    channel.onMessage = handler

    await channel.start()
    await clientStub.emitText({
      id: 'msg-guild-2',
      channelId: 'guild-channel-1',
      chatType: 'guild',
      guildId: 'guild-1',
      senderId: 'user-1',
      senderUsername: 'casey',
      senderDisplayName: 'Casey',
      text: '<@bot> hello guild',
      timestamp: new Date('2026-03-17T00:00:00.000Z'),
      isBotMentioned: true
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-guild-2',
        remoteChatId: 'guild-channel-1',
        content: '<@bot> hello guild',
        metadata: expect.objectContaining({
          discordChannelType: 'guild',
          discordIsBotMentioned: true
        })
      })
    )
  })

  it('can allow every guild message when mention gating is disabled', async () => {
    const clientStub = createClientStub()
    const handler = vi.fn()
    const channel = new DiscordChannel({
      id: 'channel-discord',
      botToken: 'discord-token',
      client: clientStub.client,
      groupRequireMention: false
    })
    channel.onMessage = handler

    await channel.start()
    await clientStub.emitText({
      id: 'msg-guild-3',
      channelId: 'guild-channel-1',
      chatType: 'guild',
      guildId: 'guild-1',
      senderId: 'user-1',
      senderUsername: 'casey',
      senderDisplayName: 'Casey',
      text: 'plain guild hello',
      timestamp: new Date('2026-03-17T00:00:00.000Z'),
      isBotMentioned: false
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-guild-3',
        remoteChatId: 'guild-channel-1',
        content: 'plain guild hello',
        metadata: expect.objectContaining({
          discordChannelType: 'guild',
          discordIsBotMentioned: false
        })
      })
    )
  })
})

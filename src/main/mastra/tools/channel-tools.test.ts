import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { RequestContext } from '@mastra/core/request-context'
import { afterEach, describe, expect, it } from 'vitest'
import { ChannelEventBus } from '../../channels/channel-event-bus'
import { CHANNEL_CONTEXT_KEY } from '../tool-context'
import { createChannelTools } from './channel-tools'

describe('channel tools', () => {
  let workspaceRoot: string | null = null

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = null
    }
  })

  it('publishes text payloads to the channel event bus', async () => {
    const bus = new ChannelEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    const requestContext = new RequestContext()
    requestContext.set(CHANNEL_CONTEXT_KEY, {
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      userId: 'user-1'
    })

    const tools = createChannelTools({ bus, workspaceRootPath: null })
    if (!tools.sendMessageToChannel.execute) {
      throw new Error('Expected sendMessageToChannel.execute to exist')
    }

    await tools.sendMessageToChannel.execute(
      {
        message: 'Hello channel'
      },
      {
        requestContext
      } as never
    )

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        content: 'Hello channel',
        payload: {
          type: 'text',
          text: 'Hello channel'
        }
      }
    ])
  })

  it('publishes image payloads with resolved workspace paths', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-channel-tools-'))
    await writeFile(path.join(workspaceRoot, 'chart.png'), 'binary', 'utf8')

    const bus = new ChannelEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    const requestContext = new RequestContext()
    requestContext.set(CHANNEL_CONTEXT_KEY, {
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      userId: 'user-1'
    })

    const tools = createChannelTools({ bus, workspaceRootPath: workspaceRoot })
    if (!tools.sendImage.execute) {
      throw new Error('Expected sendImage.execute to exist')
    }

    await tools.sendImage.execute(
      {
        filePath: 'chart.png'
      },
      {
        requestContext
      } as never
    )

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        payload: {
          type: 'image',
          filePath: path.join(workspaceRoot, 'chart.png')
        }
      }
    ])
  })

  it('publishes file payloads with a default file name', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-channel-tools-'))
    await writeFile(path.join(workspaceRoot, 'report.txt'), 'hello', 'utf8')

    const bus = new ChannelEventBus()
    const publishedEvents: unknown[] = []
    bus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    const requestContext = new RequestContext()
    requestContext.set(CHANNEL_CONTEXT_KEY, {
      channelId: 'channel-1',
      channelType: 'lark',
      remoteChatId: 'chat-1',
      userId: 'user-1'
    })

    const tools = createChannelTools({ bus, workspaceRootPath: workspaceRoot })
    if (!tools.sendFile.execute) {
      throw new Error('Expected sendFile.execute to exist')
    }

    await tools.sendFile.execute(
      {
        filePath: 'report.txt'
      },
      {
        requestContext
      } as never
    )

    expect(publishedEvents).toEqual([
      {
        eventId: expect.any(String),
        channelId: 'channel-1',
        channelType: 'lark',
        remoteChatId: 'chat-1',
        payload: {
          type: 'file',
          filePath: path.join(workspaceRoot, 'report.txt'),
          fileName: 'report.txt'
        }
      }
    ])
  })
})

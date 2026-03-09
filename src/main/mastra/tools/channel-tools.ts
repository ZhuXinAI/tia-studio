import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { ChannelEventBus } from '../../channels/channel-event-bus'
import type { RecentConversation } from '../../heartbeat/recent-conversations'
import { resolveAssistantWorkspacePath } from '../assistant-workspace'
import { getChannelExecutionContext, getHeartbeatRunId } from '../tool-context'
import { createNoArgToolInputSchema } from './tool-schema'

type ChannelToolsOptions = {
  bus: ChannelEventBus
  workspaceRootPath: string | null
  resolveRecentConversations?: () => Promise<RecentConversation[]>
}

type ChannelTarget = {
  channelId: string
  channelType: string
  remoteChatId: string
}

const targetInputSchema = z.object({
  channelId: z.string().optional(),
  channelType: z.string().optional(),
  remoteChatId: z.string().optional()
})

function resolveChannelTarget(
  options: {
    channelId?: string
    channelType?: string
    remoteChatId?: string
  },
  requestContext: Parameters<typeof getChannelExecutionContext>[0]
): ChannelTarget {
  const context = getChannelExecutionContext(requestContext)
  const channelId = options.channelId ?? context?.channelId
  const remoteChatId = options.remoteChatId ?? context?.remoteChatId
  const channelType = options.channelType ?? context?.channelType ?? 'unknown'

  if (!channelId || !remoteChatId) {
    throw new Error(
      'Missing channel target. Provide channelId and remoteChatId or run inside a channel conversation.'
    )
  }

  return {
    channelId,
    channelType,
    remoteChatId
  }
}

async function assertReadableFile(filePath: string): Promise<void> {
  const fileStats = await stat(filePath)
  if (!fileStats.isFile()) {
    throw new Error(`File path is not a file: ${filePath}`)
  }
}

function resolveFilePath(workspaceRootPath: string | null, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath
  }

  if (!workspaceRootPath) {
    throw new Error('Relative file paths require an assistant workspace root.')
  }

  return resolveAssistantWorkspacePath(workspaceRootPath, filePath)
}

export function createChannelTools(options: ChannelToolsOptions) {
  const getRecentConversations = options.resolveRecentConversations
    ? createTool({
        id: 'get-recent-conversations',
        description:
          'List recent channel conversations that this heartbeat run can explicitly target for follow-up.',
        inputSchema: createNoArgToolInputSchema(),
        outputSchema: z.object({
          conversations: z.array(
            z.object({
              threadId: z.string(),
              channelId: z.string(),
              remoteChatId: z.string(),
              lastUserMessageAt: z.string(),
              minutesSinceActivity: z.number().int().nonnegative()
            })
          )
        }),
        execute: async (_input, context) => {
          if (!getHeartbeatRunId(context.requestContext)) {
            throw new Error('Recent conversations are available only during heartbeat runs.')
          }

          return {
            conversations: await options.resolveRecentConversations?.()
          }
        }
      })
    : undefined

  const sendMessageToChannel = createTool({
    id: 'send-message-to-channel',
    description:
      'Publish a text reply request to the channel pipeline bus for the current channel conversation or an explicitly targeted remote chat.',
    inputSchema: targetInputSchema.extend({
      message: z.string().min(1)
    }),
    outputSchema: z.object({
      success: z.boolean(),
      channelId: z.string(),
      channelType: z.string(),
      remoteChatId: z.string(),
      message: z.string()
    }),
    execute: async ({ message, channelId, channelType, remoteChatId }, context) => {
      const target = resolveChannelTarget(
        {
          channelId,
          channelType,
          remoteChatId
        },
        context.requestContext
      )

      await options.bus.publish('channel.message.send-requested', {
        eventId: randomUUID(),
        channelId: target.channelId,
        channelType: target.channelType,
        remoteChatId: target.remoteChatId,
        content: message,
        payload: {
          type: 'text',
          text: message
        }
      })

      return {
        success: true,
        channelId: target.channelId,
        channelType: target.channelType,
        remoteChatId: target.remoteChatId,
        message: 'Channel send request published.'
      }
    }
  })

  const sendImage = createTool({
    id: 'send-image',
    description: 'Publish an image send request to the channel pipeline bus.',
    inputSchema: targetInputSchema.extend({
      filePath: z.string().min(1)
    }),
    outputSchema: z.object({
      success: z.boolean(),
      channelId: z.string(),
      channelType: z.string(),
      remoteChatId: z.string(),
      filePath: z.string(),
      message: z.string()
    }),
    execute: async ({ filePath, channelId, channelType, remoteChatId }, context) => {
      const target = resolveChannelTarget(
        {
          channelId,
          channelType,
          remoteChatId
        },
        context.requestContext
      )
      const resolvedFilePath = resolveFilePath(options.workspaceRootPath, filePath)
      await assertReadableFile(resolvedFilePath)

      await options.bus.publish('channel.message.send-requested', {
        eventId: randomUUID(),
        channelId: target.channelId,
        channelType: target.channelType,
        remoteChatId: target.remoteChatId,
        payload: {
          type: 'image',
          filePath: resolvedFilePath
        }
      })

      return {
        success: true,
        channelId: target.channelId,
        channelType: target.channelType,
        remoteChatId: target.remoteChatId,
        filePath: resolvedFilePath,
        message: 'Channel image send request published.'
      }
    }
  })

  const sendFile = createTool({
    id: 'send-file',
    description: 'Publish a file send request to the channel pipeline bus.',
    inputSchema: targetInputSchema.extend({
      filePath: z.string().min(1),
      fileName: z.string().min(1).optional()
    }),
    outputSchema: z.object({
      success: z.boolean(),
      channelId: z.string(),
      channelType: z.string(),
      remoteChatId: z.string(),
      filePath: z.string(),
      fileName: z.string(),
      message: z.string()
    }),
    execute: async ({ filePath, fileName, channelId, channelType, remoteChatId }, context) => {
      const target = resolveChannelTarget(
        {
          channelId,
          channelType,
          remoteChatId
        },
        context.requestContext
      )
      const resolvedFilePath = resolveFilePath(options.workspaceRootPath, filePath)
      await assertReadableFile(resolvedFilePath)
      const resolvedFileName = fileName?.trim() || path.basename(resolvedFilePath)

      await options.bus.publish('channel.message.send-requested', {
        eventId: randomUUID(),
        channelId: target.channelId,
        channelType: target.channelType,
        remoteChatId: target.remoteChatId,
        payload: {
          type: 'file',
          filePath: resolvedFilePath,
          fileName: resolvedFileName
        }
      })

      return {
        success: true,
        channelId: target.channelId,
        channelType: target.channelType,
        remoteChatId: target.remoteChatId,
        filePath: resolvedFilePath,
        fileName: resolvedFileName,
        message: 'Channel file send request published.'
      }
    }
  })

  return {
    ...(getRecentConversations ? { getRecentConversations } : {}),
    sendMessageToChannel,
    sendImage,
    sendFile
  }
}

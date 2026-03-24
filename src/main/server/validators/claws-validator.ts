import { z } from 'zod'

const createAssistantForClawSchema = z.object({
  name: z.string().min(1),
  providerId: z.string().min(1),
  enabled: z.boolean().optional(),
  workspacePath: z.string().optional()
})

const updateAssistantForClawSchema = z.object({
  name: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  enabled: z.boolean().optional()
})

const createLarkChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('lark'),
  name: z.string().min(1),
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

const createTelegramChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

const createDiscordChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('discord'),
  name: z.string().min(1),
  botToken: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

const createWhatsAppChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('whatsapp'),
  name: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

const createWechatChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('wechat'),
  name: z.string().min(1)
})

const createWeComChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('wecom'),
  name: z.string().min(1),
  botId: z.string().min(1),
  secret: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

const createWechatKfChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('wechat-kf'),
  name: z.string().min(1),
  serverUrl: z.string().min(1),
  serverKey: z.string().min(1)
})

const attachExistingChannelSchema = z.object({
  mode: z.literal('attach'),
  channelId: z.string().min(1)
})

const detachChannelSchema = z.object({
  mode: z.literal('detach')
})

const keepChannelSchema = z.object({
  mode: z.literal('keep')
})

export const createConfiguredLarkChannelSchema = z.object({
  type: z.literal('lark'),
  name: z.string().min(1),
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

export const createConfiguredTelegramChannelSchema = z.object({
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

export const createConfiguredDiscordChannelSchema = z.object({
  type: z.literal('discord'),
  name: z.string().min(1),
  botToken: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

export const createConfiguredWhatsAppChannelSchema = z.object({
  type: z.literal('whatsapp'),
  name: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

export const createConfiguredWechatChannelSchema = z.object({
  type: z.literal('wechat'),
  name: z.string().min(1)
})

export const createConfiguredWeComChannelSchema = z.object({
  type: z.literal('wecom'),
  name: z.string().min(1),
  botId: z.string().min(1),
  secret: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

export const createConfiguredWechatKfChannelSchema = z.object({
  type: z.literal('wechat-kf'),
  name: z.string().min(1),
  serverUrl: z.string().min(1),
  serverKey: z.string().min(1)
})

export const createConfiguredChannelSchema = z.union([
  createConfiguredLarkChannelSchema,
  createConfiguredTelegramChannelSchema,
  createConfiguredDiscordChannelSchema,
  createConfiguredWhatsAppChannelSchema,
  createConfiguredWechatChannelSchema,
  createConfiguredWeComChannelSchema,
  createConfiguredWechatKfChannelSchema
])

export const updateConfiguredLarkChannelSchema = z.object({
  type: z.literal('lark'),
  name: z.string().min(1),
  appId: z.string().min(1).optional(),
  appSecret: z.string().min(1).optional(),
  groupRequireMention: z.boolean().optional()
})

export const updateConfiguredTelegramChannelSchema = z.object({
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1).optional(),
  groupRequireMention: z.boolean().optional()
})

export const updateConfiguredDiscordChannelSchema = z.object({
  type: z.literal('discord'),
  name: z.string().min(1),
  botToken: z.string().min(1).optional(),
  groupRequireMention: z.boolean().optional()
})

export const updateConfiguredWhatsAppChannelSchema = z.object({
  type: z.literal('whatsapp'),
  name: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

export const updateConfiguredWechatChannelSchema = z.object({
  type: z.literal('wechat'),
  name: z.string().min(1)
})

export const updateConfiguredWeComChannelSchema = z.object({
  type: z.literal('wecom'),
  name: z.string().min(1),
  botId: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
  groupRequireMention: z.boolean().optional()
})

export const updateConfiguredWechatKfChannelSchema = z.object({
  type: z.literal('wechat-kf'),
  name: z.string().min(1),
  serverUrl: z.string().min(1).optional(),
  serverKey: z.string().min(1).optional()
})

export const updateConfiguredChannelSchema = z.union([
  updateConfiguredLarkChannelSchema,
  updateConfiguredTelegramChannelSchema,
  updateConfiguredDiscordChannelSchema,
  updateConfiguredWhatsAppChannelSchema,
  updateConfiguredWechatChannelSchema,
  updateConfiguredWeComChannelSchema,
  updateConfiguredWechatKfChannelSchema
])

export const createClawSchema = z.object({
  assistant: createAssistantForClawSchema,
  channel: z
    .union([
      createLarkChannelSchema,
      createTelegramChannelSchema,
      createDiscordChannelSchema,
      createWhatsAppChannelSchema,
      createWechatChannelSchema,
      createWeComChannelSchema,
      createWechatKfChannelSchema,
      attachExistingChannelSchema
    ])
    .optional()
})

export const updateClawSchema = z.object({
  assistant: updateAssistantForClawSchema.optional(),
  channel: z
    .union([
      createLarkChannelSchema,
      createTelegramChannelSchema,
      createDiscordChannelSchema,
      createWhatsAppChannelSchema,
      createWechatChannelSchema,
      createWeComChannelSchema,
      createWechatKfChannelSchema,
      attachExistingChannelSchema,
      detachChannelSchema,
      keepChannelSchema
    ])
    .optional()
})

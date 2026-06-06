import { z } from 'zod'

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

export const createConfiguredChannelSchema = z.union([
  createConfiguredLarkChannelSchema,
  createConfiguredTelegramChannelSchema,
  createConfiguredDiscordChannelSchema,
  createConfiguredWhatsAppChannelSchema,
  createConfiguredWechatChannelSchema,
  createConfiguredWeComChannelSchema
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

export const updateConfiguredChannelSchema = z.union([
  updateConfiguredLarkChannelSchema,
  updateConfiguredTelegramChannelSchema,
  updateConfiguredDiscordChannelSchema,
  updateConfiguredWhatsAppChannelSchema,
  updateConfiguredWechatChannelSchema,
  updateConfiguredWeComChannelSchema
])

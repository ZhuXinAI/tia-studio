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

const createWhatsAppChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('whatsapp'),
  name: z.string().min(1),
  groupRequireMention: z.boolean().optional()
})

const createWeComChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('wecom'),
  name: z.string().min(1),
  botId: z.string().min(1),
  secret: z.string().min(1),
  groupRequireMention: z.boolean().optional()
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

export const createConfiguredWhatsAppChannelSchema = z.object({
  type: z.literal('whatsapp'),
  name: z.string().min(1),
  groupRequireMention: z.boolean().optional()
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
  createConfiguredWhatsAppChannelSchema,
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

export const updateConfiguredWhatsAppChannelSchema = z.object({
  type: z.literal('whatsapp'),
  name: z.string().min(1),
  groupRequireMention: z.boolean().optional()
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
  updateConfiguredWhatsAppChannelSchema,
  updateConfiguredWeComChannelSchema
])

export const createClawSchema = z.object({
  assistant: createAssistantForClawSchema,
  channel: z
    .union([
      createLarkChannelSchema,
      createTelegramChannelSchema,
      createWhatsAppChannelSchema,
      createWeComChannelSchema,
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
      createWhatsAppChannelSchema,
      createWeComChannelSchema,
      attachExistingChannelSchema,
      detachChannelSchema,
      keepChannelSchema
    ])
    .optional()
})

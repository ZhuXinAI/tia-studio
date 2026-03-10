import { z } from 'zod'

const createAssistantForClawSchema = z.object({
  name: z.string().min(1),
  providerId: z.string().min(1),
  instructions: z.string().optional(),
  enabled: z.boolean().optional()
})

const updateAssistantForClawSchema = z.object({
  name: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  instructions: z.string().optional(),
  enabled: z.boolean().optional()
})

const createLarkChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('lark'),
  name: z.string().min(1),
  appId: z.string().min(1),
  appSecret: z.string().min(1)
})

const createTelegramChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1)
})

const createWhatsAppChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('whatsapp'),
  name: z.string().min(1)
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
  appSecret: z.string().min(1)
})

export const createConfiguredTelegramChannelSchema = z.object({
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1)
})

export const createConfiguredWhatsAppChannelSchema = z.object({
  type: z.literal('whatsapp'),
  name: z.string().min(1)
})

export const createConfiguredChannelSchema = z.union([
  createConfiguredLarkChannelSchema,
  createConfiguredTelegramChannelSchema,
  createConfiguredWhatsAppChannelSchema
])

export const updateConfiguredLarkChannelSchema = z.object({
  type: z.literal('lark'),
  name: z.string().min(1),
  appId: z.string().min(1).optional(),
  appSecret: z.string().min(1).optional()
})

export const updateConfiguredTelegramChannelSchema = z.object({
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1).optional()
})

export const updateConfiguredWhatsAppChannelSchema = z.object({
  type: z.literal('whatsapp'),
  name: z.string().min(1)
})

export const updateConfiguredChannelSchema = z.union([
  updateConfiguredLarkChannelSchema,
  updateConfiguredTelegramChannelSchema,
  updateConfiguredWhatsAppChannelSchema
])

export const createClawSchema = z.object({
  assistant: createAssistantForClawSchema,
  channel: z
    .union([
      createLarkChannelSchema,
      createTelegramChannelSchema,
      createWhatsAppChannelSchema,
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
      attachExistingChannelSchema,
      detachChannelSchema,
      keepChannelSchema
    ])
    .optional()
})

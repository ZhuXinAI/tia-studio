import { z } from 'zod'

const larkSettingsSchema = z.object({
  enabled: z.boolean(),
  name: z.string().min(1, 'Lark name is required'),
  assistantId: z.string().min(1, 'Lark assistant is required'),
  appId: z.string().min(1, 'Lark app ID is required'),
  appSecret: z.string().min(1, 'Lark app secret is required')
})

export const updateChannelsSettingsSchema = z.object({
  lark: larkSettingsSchema
})

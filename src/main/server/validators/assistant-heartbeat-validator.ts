import { z } from 'zod'

export const updateAssistantHeartbeatSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1, 'Heartbeat interval must be at least 1 minute'),
  prompt: z.string().min(1)
})

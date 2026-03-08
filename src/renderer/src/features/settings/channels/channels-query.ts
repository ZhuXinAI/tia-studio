import { createApiClient } from '../../../lib/api-client'

export type ChannelConnectionStatus = 'disconnected' | 'connected' | 'error'

export type LarkChannelSettings = {
  id: string | null
  enabled: boolean
  name: string
  assistantId: string | null
  appId: string
  appSecret: string
  status: ChannelConnectionStatus
  errorMessage: string | null
}

export type ChannelsSettings = {
  lark: LarkChannelSettings
}

export type UpdateChannelsSettingsInput = {
  lark: {
    enabled: boolean
    name: string
    assistantId: string
    appId: string
    appSecret: string
  }
}

const apiClient = createApiClient()

export async function getChannelsSettings(): Promise<ChannelsSettings> {
  return apiClient.get<ChannelsSettings>('/v1/settings/channels')
}

export async function updateChannelsSettings(
  input: UpdateChannelsSettingsInput
): Promise<ChannelsSettings> {
  return apiClient.put<ChannelsSettings>('/v1/settings/channels', input)
}

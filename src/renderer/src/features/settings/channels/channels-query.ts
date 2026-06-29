import { createApiClient } from '../../../lib/api-client'

export type ChannelAuthStateRecord = {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error'
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  accountLabel: string | null
  errorMessage: string | null
  updatedAt: string
}

export type ConfiguredChannelRecord = {
  id: string
  type: string
  name: string
  groupRequireMention?: boolean
  assistantId: string | null
  assistantName: string | null
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
  pairedCount: number
  pendingPairingCount: number
  authState: ChannelAuthStateRecord | null
}

export type CreateChannelInput =
  | {
      type: 'lark'
      name: string
      appId: string
      appSecret: string
      groupRequireMention?: boolean
    }
  | {
      type: 'telegram'
      name: string
      botToken: string
      groupRequireMention?: boolean
    }
  | {
      type: 'discord'
      name: string
      botToken: string
      groupRequireMention?: boolean
    }
  | {
      type: 'whatsapp'
      name: string
      groupRequireMention?: boolean
    }
  | {
      type: 'wechat'
      name: string
    }
  | {
      type: 'wecom'
      name: string
      botId: string
      secret: string
      groupRequireMention?: boolean
    }

export type UpdateChannelInput =
  | {
      type: 'lark'
      name: string
      appId?: string
      appSecret?: string
      groupRequireMention?: boolean
    }
  | {
      type: 'telegram'
      name: string
      botToken?: string
      groupRequireMention?: boolean
    }
  | {
      type: 'discord'
      name: string
      botToken?: string
      groupRequireMention?: boolean
    }
  | {
      type: 'whatsapp'
      name: string
      groupRequireMention?: boolean
    }
  | {
      type: 'wechat'
      name: string
    }
  | {
      type: 'wecom'
      name: string
      botId?: string
      secret?: string
      groupRequireMention?: boolean
    }

const apiClient = createApiClient()

export async function listChannels(): Promise<ConfiguredChannelRecord[]> {
  return apiClient.get<ConfiguredChannelRecord[]>('/v1/channels')
}

export async function createChannel(input: CreateChannelInput): Promise<ConfiguredChannelRecord> {
  return apiClient.post<ConfiguredChannelRecord>('/v1/channels', input)
}

export async function updateChannel(
  channelId: string,
  input: UpdateChannelInput
): Promise<ConfiguredChannelRecord> {
  return apiClient.patch<ConfiguredChannelRecord>(`/v1/channels/${channelId}`, input)
}

export async function deleteChannel(channelId: string): Promise<void> {
  await apiClient.delete(`/v1/channels/${channelId}`)
}

export async function recoverChannelSetup(channelId: string): Promise<ConfiguredChannelRecord> {
  return apiClient.post<ConfiguredChannelRecord>(`/v1/channels/${channelId}/recover`)
}

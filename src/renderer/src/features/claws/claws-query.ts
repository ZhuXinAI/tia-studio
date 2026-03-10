import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

export type ClawChannelRecord = {
  id: string
  type: string
  name: string
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
  pairedCount?: number
  pendingPairingCount?: number
}

export type ClawRecord = {
  id: string
  name: string
  description: string
  instructions: string
  providerId: string | null
  enabled: boolean
  channel: ClawChannelRecord | null
}

export type ConfiguredClawChannelRecord = {
  id: string
  type: string
  name: string
  assistantId: string | null
  assistantName: string | null
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
  pairedCount: number
  pendingPairingCount: number
}

export type ClawsResponse = {
  claws: ClawRecord[]
  configuredChannels: ConfiguredClawChannelRecord[]
}

export type ClawPairingRecord = {
  id: string
  channelId: string
  remoteChatId: string
  senderId: string
  senderDisplayName: string
  senderUsername: string | null
  code: string
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  expiresAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  revokedAt: string | null
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}

export type ClawPairingsResponse = {
  pairings: ClawPairingRecord[]
}

export type ClawChannelAuthRecord = {
  channelId: string
  channelType: 'whatsapp'
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error'
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  phoneNumber: string | null
  errorMessage: string | null
  updatedAt: string
}

export type SaveClawInput = {
  assistant: {
    name?: string
    providerId?: string
    instructions?: string
    enabled?: boolean
  }
  channel?:
    | {
        mode: 'create'
        type: 'lark'
        name: string
        appId: string
        appSecret: string
      }
    | {
        mode: 'create'
        type: 'telegram'
        name: string
        botToken: string
      }
    | {
        mode: 'create'
        type: 'whatsapp'
        name: string
      }
    | {
        mode: 'attach'
        channelId: string
      }
    | {
        mode: 'detach'
      }
    | {
        mode: 'keep'
      }
}

export type CreateClawChannelInput =
  | {
      type: 'lark'
      name: string
      appId: string
      appSecret: string
    }
  | {
      type: 'telegram'
      name: string
      botToken: string
    }
  | {
      type: 'whatsapp'
      name: string
    }

export type UpdateClawChannelInput =
  | {
      type: 'lark'
      name: string
      appId?: string
      appSecret?: string
    }
  | {
      type: 'telegram'
      name: string
      botToken?: string
    }
  | {
      type: 'whatsapp'
      name: string
    }

const apiClient = createApiClient()

export const clawKeys = {
  all: ['claws'] as const,
  list: () => [...clawKeys.all, 'list'] as const,
  detail: (id: string) => [...clawKeys.all, 'detail', id] as const
}

export async function listClaws(): Promise<ClawsResponse> {
  return apiClient.get<ClawsResponse>('/v1/claws')
}

export async function createClaw(input: SaveClawInput): Promise<ClawRecord> {
  return apiClient.post<ClawRecord>('/v1/claws', input)
}

export async function createClawChannel(
  input: CreateClawChannelInput
): Promise<ConfiguredClawChannelRecord> {
  return apiClient.post<ConfiguredClawChannelRecord>('/v1/claws/channels', input)
}

export async function updateClawChannel(
  channelId: string,
  input: UpdateClawChannelInput
): Promise<ConfiguredClawChannelRecord> {
  return apiClient.patch<ConfiguredClawChannelRecord>(`/v1/claws/channels/${channelId}`, input)
}

export async function updateClaw(assistantId: string, input: SaveClawInput): Promise<ClawRecord> {
  return apiClient.patch<ClawRecord>(`/v1/claws/${assistantId}`, input)
}

export async function deleteClaw(assistantId: string): Promise<void> {
  await apiClient.delete(`/v1/claws/${assistantId}`)
}

export async function deleteClawChannel(channelId: string): Promise<void> {
  await apiClient.delete(`/v1/claws/channels/${channelId}`)
}

export async function listClawPairings(assistantId: string): Promise<ClawPairingsResponse> {
  return apiClient.get<ClawPairingsResponse>(`/v1/claws/${assistantId}/pairings`)
}

export async function getClawChannelAuthState(assistantId: string): Promise<ClawChannelAuthRecord> {
  return apiClient.get<ClawChannelAuthRecord>(`/v1/claws/${assistantId}/channel-auth`)
}

export async function approveClawPairing(
  assistantId: string,
  pairingId: string
): Promise<ClawPairingRecord> {
  return apiClient.post<ClawPairingRecord>(`/v1/claws/${assistantId}/pairings/${pairingId}/approve`)
}

export async function rejectClawPairing(
  assistantId: string,
  pairingId: string
): Promise<ClawPairingRecord> {
  return apiClient.post<ClawPairingRecord>(`/v1/claws/${assistantId}/pairings/${pairingId}/reject`)
}

export async function revokeClawPairing(
  assistantId: string,
  pairingId: string
): Promise<ClawPairingRecord> {
  return apiClient.post<ClawPairingRecord>(`/v1/claws/${assistantId}/pairings/${pairingId}/revoke`)
}

export function useClaws() {
  return useQuery({
    queryKey: clawKeys.list(),
    queryFn: listClaws
  })
}

export function useCreateClaw() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createClaw,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clawKeys.list() })
    }
  })
}

export function useUpdateClaw() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SaveClawInput }) => updateClaw(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clawKeys.list() })
    }
  })
}

export function useDeleteClaw() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteClaw,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clawKeys.list() })
    }
  })
}

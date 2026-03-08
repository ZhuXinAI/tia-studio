import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

export type ClawChannelRecord = {
  id: string
  type: string
  name: string
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
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

export type AvailableClawChannelRecord = {
  id: string
  type: string
  name: string
}

export type ClawsResponse = {
  claws: ClawRecord[]
  availableChannels: AvailableClawChannelRecord[]
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

export async function updateClaw(assistantId: string, input: SaveClawInput): Promise<ClawRecord> {
  return apiClient.patch<ClawRecord>(`/v1/claws/${assistantId}`, input)
}

export async function deleteClaw(assistantId: string): Promise<void> {
  await apiClient.delete(`/v1/claws/${assistantId}`)
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

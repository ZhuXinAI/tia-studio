import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SaveTiaAutomationInput, TiaAutomationRecord } from '../../../../shared/automations'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const automationKeys = {
  all: ['tia-automations'] as const,
  list: () => [...automationKeys.all, 'list'] as const
}

export function useAutomations() {
  return useQuery({
    queryKey: automationKeys.list(),
    queryFn: () => api.get<TiaAutomationRecord[]>('/v1/automations'),
    refetchInterval: 30_000
  })
}

function invalidatingMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  return function useAutomationMutation() {
    const client = useQueryClient()
    return useMutation({
      mutationFn,
      onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all })
    })
  }
}

export const useCreateAutomation = invalidatingMutation((input: SaveTiaAutomationInput) =>
  api.post<TiaAutomationRecord>('/v1/automations', input)
)

export const useUpdateAutomation = invalidatingMutation(
  ({ id, input }: { id: string; input: SaveTiaAutomationInput }) =>
    api.put<TiaAutomationRecord>(`/v1/automations/${id}`, input)
)

export const useDeleteAutomation = invalidatingMutation((id: string) =>
  api.delete(`/v1/automations/${id}`)
)

export const useRunAutomation = invalidatingMutation((id: string) =>
  api.post<TiaAutomationRecord>(`/v1/automations/${id}/run`)
)

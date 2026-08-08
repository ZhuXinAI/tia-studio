import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkspaceDirectory, WorkspaceFileContent } from '../../../../shared/workspace-files'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const workspaceFileKeys = {
  all: ['workspace-files'] as const,
  directory: (sessionId: string, relativePath: string) =>
    [...workspaceFileKeys.all, 'directory', sessionId, relativePath] as const,
  content: (sessionId: string, relativePath: string) =>
    [...workspaceFileKeys.all, 'content', sessionId, relativePath] as const
}

function encodedPath(relativePath: string): string {
  return encodeURIComponent(relativePath)
}

export function getWorkspaceDirectory(
  sessionId: string,
  relativePath: string
): Promise<WorkspaceDirectory> {
  return api.get<WorkspaceDirectory>(
    `/v1/agent/sessions/${encodeURIComponent(sessionId)}/files?path=${encodedPath(relativePath)}`
  )
}

export function getWorkspaceFile(
  sessionId: string,
  relativePath: string
): Promise<WorkspaceFileContent> {
  return api.get<WorkspaceFileContent>(
    `/v1/agent/sessions/${encodeURIComponent(sessionId)}/files/content?path=${encodedPath(relativePath)}`
  )
}

export function useWorkspaceDirectories(sessionId: string, relativePaths: string[]) {
  return useQueries({
    queries: relativePaths.map((relativePath) => ({
      queryKey: workspaceFileKeys.directory(sessionId, relativePath),
      queryFn: () => getWorkspaceDirectory(sessionId, relativePath),
      staleTime: 2_000
    }))
  })
}

export function useWorkspaceFile(sessionId: string, relativePath: string | null) {
  return useQuery({
    queryKey: workspaceFileKeys.content(sessionId, relativePath ?? ''),
    queryFn: () => getWorkspaceFile(sessionId, relativePath ?? ''),
    enabled: Boolean(relativePath),
    staleTime: 1_000
  })
}

export function useSaveWorkspaceFile(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { path: string; content: string; expectedSha256: string }) =>
      api.put<WorkspaceFileContent>(
        `/v1/agent/sessions/${encodeURIComponent(sessionId)}/files/content`,
        input
      ),
    onSuccess: (content) => {
      queryClient.setQueryData(workspaceFileKeys.content(sessionId, content.relativePath), content)
      queryClient.invalidateQueries({ queryKey: workspaceFileKeys.all })
    }
  })
}

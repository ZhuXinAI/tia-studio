import { useInfiniteQuery } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'
import type {
  DesktopSkillCatalogPage,
  DesktopSkillSource
} from '../../../../shared/desktop-discovery'

const apiClient = createApiClient()
const desktopSkillCatalogPageSize = 24

export const skillCatalogKeys = {
  all: ['desktop-skills'] as const,
  list: (input: { search: string; source: DesktopSkillSource | 'all' }) =>
    [...skillCatalogKeys.all, 'list', input] as const
}

function buildDesktopSkillsCatalogPath(input: {
  cursor?: string | null
  search: string
  source: DesktopSkillSource | null
}): string {
  const searchParams = new URLSearchParams()
  searchParams.set('limit', String(desktopSkillCatalogPageSize))

  if (input.cursor) {
    searchParams.set('cursor', input.cursor)
  }
  if (input.search.trim().length > 0) {
    searchParams.set('search', input.search.trim())
  }
  if (input.source) {
    searchParams.set('source', input.source)
  }

  return `/v1/desktop/skills?${searchParams.toString()}`
}

export async function listDesktopSkillsCatalogPage(input: {
  cursor?: string | null
  search: string
  source: DesktopSkillSource | null
}): Promise<DesktopSkillCatalogPage> {
  return apiClient.get<DesktopSkillCatalogPage>(buildDesktopSkillsCatalogPath(input))
}

export function useDesktopSkillsCatalog(input: {
  search: string
  source: DesktopSkillSource | null
}) {
  const normalizedSearch = input.search.trim()

  return useInfiniteQuery({
    queryKey: skillCatalogKeys.list({
      search: normalizedSearch,
      source: input.source ?? 'all'
    }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listDesktopSkillsCatalogPage({
        cursor: pageParam,
        search: normalizedSearch,
        source: input.source
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  })
}

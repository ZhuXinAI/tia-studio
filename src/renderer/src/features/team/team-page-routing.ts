import type { TeamThreadRecord } from './team-threads-query'

type TeamRouteSelection = {
  workspaceId: string
  threadId: string | null
}

const teamSelectionStorageKey = 'tia.team.last-selection'

export function routeToTeam(workspaceId?: string | null, threadId?: string | null): string {
  if (workspaceId && threadId) {
    return `/team/${workspaceId}/${threadId}`
  }

  if (workspaceId) {
    return `/team/${workspaceId}`
  }

  return '/team'
}

export function sortTeamThreadsByRecentActivity(threads: TeamThreadRecord[]): TeamThreadRecord[] {
  return [...threads].sort((left, right) => {
    const leftDate = Date.parse(left.lastMessageAt ?? left.createdAt)
    const rightDate = Date.parse(right.lastMessageAt ?? right.createdAt)
    return rightDate - leftDate
  })
}

export function readStoredTeamSelection(): TeamRouteSelection | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(teamSelectionStorageKey)
  if (!storedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(storedValue) as {
      workspaceId?: unknown
      threadId?: unknown
    }

    if (typeof parsed.workspaceId !== 'string' || parsed.workspaceId.trim().length === 0) {
      return null
    }

    return {
      workspaceId: parsed.workspaceId,
      threadId:
        typeof parsed.threadId === 'string' && parsed.threadId.trim().length > 0
          ? parsed.threadId
          : null
    }
  } catch {
    return null
  }
}

export function storeTeamSelection(selection: TeamRouteSelection): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(teamSelectionStorageKey, JSON.stringify(selection))
}

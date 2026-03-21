// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  readStoredTeamSelection,
  routeToTeam,
  sortTeamThreadsByRecentActivity,
  storeTeamSelection
} from './team-page-routing'

describe('team page routing', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('builds team routes for app root, workspace, and thread detail', () => {
    expect(routeToTeam()).toBe('/team')
    expect(routeToTeam('workspace-1')).toBe('/team/workspace-1')
    expect(routeToTeam('workspace-1', 'thread-1')).toBe('/team/workspace-1/thread-1')
  })

  it('returns null when the stored team selection is missing or invalid', () => {
    expect(readStoredTeamSelection()).toBeNull()

    window.localStorage.setItem('tia.team.last-selection', '{')
    expect(readStoredTeamSelection()).toBeNull()

    window.localStorage.setItem(
      'tia.team.last-selection',
      JSON.stringify({ workspaceId: '', threadId: 'thread-1' })
    )
    expect(readStoredTeamSelection()).toBeNull()
  })

  it('stores and reads the last selected workspace and thread', () => {
    storeTeamSelection({
      workspaceId: 'workspace-1',
      threadId: 'thread-1'
    })

    expect(readStoredTeamSelection()).toEqual({
      workspaceId: 'workspace-1',
      threadId: 'thread-1'
    })
  })

  it('sorts the most recent team thread first using lastMessageAt and createdAt', () => {
    const sortedThreads = sortTeamThreadsByRecentActivity([
      {
        id: 'thread-1',
        workspaceId: 'workspace-1',
        resourceId: 'profile-1',
        title: 'Older',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        lastMessageAt: null,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      },
      {
        id: 'thread-2',
        workspaceId: 'workspace-1',
        resourceId: 'profile-1',
        title: 'Recent',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        lastMessageAt: '2026-03-08T00:00:00.000Z',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-08T00:00:00.000Z'
      }
    ])

    expect(sortedThreads.map((thread) => thread.id)).toEqual(['thread-2', 'thread-1'])
  })
})

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { i18n } from '../../../i18n'
import { listAssistants, type AssistantRecord } from '../../assistants/assistants-query'
import { getActiveResourceId } from '../../threads/threads-query'
import { toErrorMessage } from '../../threads/thread-page-routing'
import {
  listGroupThreadMessages,
  submitGroupWatcherMessage,
  type GroupRoomMessageRecord
} from '../group-chat-query'
import {
  createGroupThread,
  deleteGroupThread,
  listGroupThreads,
  type GroupThreadRecord
} from '../group-threads-query'
import {
  openGroupStatusStream,
  type GroupStatusEvent,
  type GroupStatusStreamHandle
} from '../group-status-stream'
import {
  openGroupThreadEventsStream,
  type GroupThreadEventsStreamHandle
} from '../group-thread-events-stream'
import {
  createGroup,
  listGroupMembers,
  listGroups,
  replaceGroupMembers,
  updateGroup,
  type GroupRecord
} from '../group-groups-query'
import type { GroupConfigDialogValues } from '../components/group-config-dialog'

type GroupReadinessCheckId = 'thread' | 'members'

export type GroupReadinessCheck = {
  id: GroupReadinessCheckId
  label: string
  ready: boolean
}

export type GroupReadiness = {
  canChat: boolean
  checks: GroupReadinessCheck[]
}

export type GroupPageController = ReturnType<typeof useGroupPageController>

function routeToGroup(groupId?: string | null, threadId?: string | null): string {
  if (groupId && threadId) {
    return `/group/${groupId}/${threadId}`
  }

  if (groupId) {
    return `/group/${groupId}`
  }

  return '/group'
}

function sortGroupThreadsByRecentActivity(threads: GroupThreadRecord[]): GroupThreadRecord[] {
  return [...threads].sort((left, right) => {
    const leftDate = Date.parse(left.lastMessageAt ?? left.createdAt)
    const rightDate = Date.parse(right.lastMessageAt ?? right.createdAt)
    return rightDate - leftDate
  })
}

function evaluateGroupReadiness(input: {
  selectedThread: GroupThreadRecord | null
  selectedMemberIds: string[]
  selectedMembers: AssistantRecord[]
}): GroupReadiness {
  const checks: GroupReadinessCheck[] = [
    {
      id: 'thread',
      label: i18n.t('group.readiness.threadSelected'),
      ready: Boolean(input.selectedThread)
    },
    {
      id: 'members',
      label: i18n.t('group.readiness.membersSelected'),
      ready: input.selectedMemberIds.length > 0 && input.selectedMembers.length > 0
    }
  ]

  return {
    canChat: checks.every((check) => check.ready),
    checks
  }
}

function resolveActiveSpeakerName(
  event: GroupStatusEvent,
  assistants: AssistantRecord[]
): string | null {
  const assistantName = event.data?.assistantName
  if (typeof assistantName === 'string' && assistantName.trim().length > 0) {
    return assistantName
  }

  const speakerName = event.data?.speakerName
  if (typeof speakerName === 'string' && speakerName.trim().length > 0) {
    return speakerName
  }

  const assistantId = event.data?.assistantId
  if (typeof assistantId === 'string' && assistantId.trim().length > 0) {
    return assistants.find((assistant) => assistant.id === assistantId)?.name ?? null
  }

  return null
}

export function useGroupPageController() {
  const params = useParams()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [threads, setThreads] = useState<GroupThreadRecord[]>([])
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [messages, setMessages] = useState<GroupRoomMessageRecord[]>([])
  const [statusEvents, setStatusEvents] = useState<GroupStatusEvent[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeSpeakerName, setActiveSpeakerName] = useState<string | null>(null)
  const [isAgentTyping, setIsAgentTyping] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [configDialogMode, setConfigDialogMode] = useState<'create' | 'edit'>('edit')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const statusStreamRef = useRef<GroupStatusStreamHandle | null>(null)
  const threadEventsStreamRef = useRef<GroupThreadEventsStreamHandle | null>(null)
  const threadListLoadStateRef = useRef<{
    groupId: string | null
    hasResolved: boolean
  }>({
    groupId: null,
    hasResolved: false
  })
  const profileId = useMemo(() => getActiveResourceId(), [])

  const selectedGroup = useMemo(() => {
    const groupId = params.groupId
    if (!groupId) {
      return null
    }

    return groups.find((group) => group.id === groupId) ?? null
  }, [groups, params.groupId])

  const selectedThread = useMemo(() => {
    const threadId = params.threadId
    if (!threadId) {
      return null
    }

    return threads.find((thread) => thread.id === threadId) ?? null
  }, [params.threadId, threads])

  const selectedMembers = useMemo(() => {
    return selectedMemberIds
      .map((assistantId) => assistants.find((assistant) => assistant.id === assistantId) ?? null)
      .filter((assistant): assistant is AssistantRecord => assistant !== null)
  }, [assistants, selectedMemberIds])

  const selectedThreadId = selectedThread?.id ?? null

  const readiness = useMemo(() => {
    return evaluateGroupReadiness({
      selectedThread,
      selectedMemberIds,
      selectedMembers
    })
  }, [selectedMemberIds, selectedMembers, selectedThread])

  const selectedThreadProfileId = selectedThread?.resourceId ?? profileId
  const isCreatingGroup = false
  const hasResolvedSelectedGroupThreads =
    selectedGroup !== null &&
    threadListLoadStateRef.current.groupId === selectedGroup.id &&
    threadListLoadStateRef.current.hasResolved

  const markThreadActive = useCallback((threadId: string, timestamp: string) => {
    setThreads((currentThreads) =>
      sortGroupThreadsByRecentActivity(
        currentThreads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                lastMessageAt: timestamp,
                updatedAt: timestamp
              }
            : thread
        )
      )
    )
  }, [])

  const refreshThreadHistory = useCallback(
    async (input: {
      threadId: string
      profileId: string
      showLoading?: boolean
      fallbackTimestamp?: string
    }): Promise<void> => {
      if (input.showLoading) {
        setIsLoadingMessages(true)
      }

      try {
        const nextMessages = await listGroupThreadMessages({
          threadId: input.threadId,
          profileId: input.profileId
        })
        setMessages(nextMessages)

        const latestTimestamp =
          nextMessages.at(-1)?.createdAt ?? input.fallbackTimestamp ?? new Date().toISOString()
        if (nextMessages.length > 0 || input.fallbackTimestamp) {
          markThreadActive(input.threadId, latestTimestamp)
        }
      } catch (error) {
        setMessages([])
        setLoadError(toErrorMessage(error))
      } finally {
        if (input.showLoading) {
          setIsLoadingMessages(false)
        }
      }
    },
    [markThreadActive]
  )

  const handleStatusEvent = useCallback(
    (event: GroupStatusEvent) => {
      setStatusEvents((current) => [...current, event])

      if (event.type === 'message-posted') {
        setIsAgentTyping(false)

        if (selectedThreadId && event.threadId === selectedThreadId) {
          void refreshThreadHistory({
            threadId: selectedThreadId,
            profileId: selectedThreadProfileId,
            fallbackTimestamp: event.createdAt
          })
        }

        return
      }

      if (event.type === 'speaker-selected') {
        setActiveSpeakerName(resolveActiveSpeakerName(event, assistants))
        return
      }

      if (event.type === 'turn-started') {
        setActiveSpeakerName(resolveActiveSpeakerName(event, assistants))
        setIsAgentTyping(true)
        return
      }

      if (
        event.type === 'turn-passed' ||
        event.type === 'run-finished' ||
        event.type === 'run-failed'
      ) {
        setIsAgentTyping(false)
      }

      if (event.type === 'run-finished' || event.type === 'run-failed') {
        setActiveRunId((currentRunId) => (currentRunId === event.runId ? null : currentRunId))
      }
    },
    [assistants, refreshThreadHistory, selectedThreadId, selectedThreadProfileId]
  )

  useEffect(() => {
    return () => {
      statusStreamRef.current?.close()
      threadEventsStreamRef.current?.close()
    }
  }, [])

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setIsLoadingData(true)
      setLoadError(null)

      try {
        const [groupsResult, assistantsResult] = await Promise.all([
          listGroups(),
          listAssistants()
        ])

        setGroups(groupsResult)
        setAssistants(assistantsResult)
      } catch (error) {
        setLoadError(toErrorMessage(error))
      } finally {
        setIsLoadingData(false)
      }
    }

    void loadData()
  }, [])

  useEffect(() => {
    if (isLoadingData || selectedGroup || groups.length === 0 || params.groupId) {
      return
    }

    navigate(routeToGroup(groups[0]?.id ?? null), { replace: true })
  }, [groups, isLoadingData, navigate, params.groupId, selectedGroup])

  useEffect(() => {
    if (!selectedGroup) {
      threadListLoadStateRef.current = {
        groupId: null,
        hasResolved: false
      }
      setThreads([])
      return
    }

    let active = true
    threadListLoadStateRef.current = {
      groupId: selectedGroup.id,
      hasResolved: false
    }
    setIsLoadingThreads(true)
    setLoadError(null)

    void listGroupThreads(selectedGroup.id)
      .then((nextThreads) => {
        if (!active) {
          return
        }

        setThreads(sortGroupThreadsByRecentActivity(nextThreads))
      })
      .catch((error) => {
        if (active) {
          setLoadError(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          threadListLoadStateRef.current = {
            groupId: selectedGroup.id,
            hasResolved: true
          }
          setIsLoadingThreads(false)
        }
      })

    return () => {
      active = false
    }
  }, [selectedGroup])

  useEffect(() => {
    if (
      !selectedGroup ||
      !params.threadId ||
      selectedThread ||
      !hasResolvedSelectedGroupThreads
    ) {
      return
    }

    navigate(routeToGroup(selectedGroup.id), { replace: true })
  }, [
    hasResolvedSelectedGroupThreads,
    navigate,
    params.threadId,
    selectedThread,
    selectedGroup
  ])

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedMemberIds([])
      return
    }

    let active = true
    void listGroupMembers(selectedGroup.id)
      .then((members) => {
        if (!active) {
          return
        }

        setSelectedMemberIds(members.map((member) => member.assistantId))
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setSelectedMemberIds([])
        setLoadError(toErrorMessage(error))
      })

    return () => {
      active = false
    }
  }, [selectedGroup])

  useEffect(() => {
    threadEventsStreamRef.current?.close()
    threadEventsStreamRef.current = null

    if (!selectedThreadId) {
      setMessages([])
      setIsLoadingMessages(false)
      return
    }

    void refreshThreadHistory({
      threadId: selectedThreadId,
      profileId: selectedThreadProfileId,
      showLoading: true
    })

    const nextThreadEventsStream = openGroupThreadEventsStream({
      threadId: selectedThreadId,
      profileId: selectedThreadProfileId,
      onEvent: (event) => {
        void refreshThreadHistory({
          threadId: event.threadId,
          profileId: event.profileId,
          fallbackTimestamp: event.createdAt
        })
      },
      onError: (error) => {
        setLoadError(toErrorMessage(error))
      }
    })
    threadEventsStreamRef.current = nextThreadEventsStream

    return () => {
      nextThreadEventsStream.close()
      if (threadEventsStreamRef.current === nextThreadEventsStream) {
        threadEventsStreamRef.current = null
      }
    }
  }, [refreshThreadHistory, selectedThreadId, selectedThreadProfileId])

  useEffect(() => {
    statusStreamRef.current?.close()
    statusStreamRef.current = null

    if (!selectedThreadId || !activeRunId) {
      return
    }

    const nextStatusStream = openGroupStatusStream({
      threadId: selectedThreadId,
      runId: activeRunId,
      onEvent: handleStatusEvent,
      onError: (error) => {
        setLoadError(toErrorMessage(error))
      }
    })
    statusStreamRef.current = nextStatusStream

    return () => {
      nextStatusStream.close()
      if (statusStreamRef.current === nextStatusStream) {
        statusStreamRef.current = null
      }
    }
  }, [activeRunId, handleStatusEvent, selectedThreadId])

  useEffect(() => {
    if (!selectedThreadId) {
      setStatusEvents([])
      setActiveRunId(null)
      setActiveSpeakerName(null)
      setIsAgentTyping(false)
    }
  }, [selectedThreadId])

  const handleSelectGroup = useCallback(
    (groupId: string) => {
      navigate(routeToGroup(groupId))
    },
    [navigate]
  )

  const handleSelectThread = useCallback(
    (threadId: string) => {
      navigate(routeToGroup(selectedGroup?.id ?? null, threadId))
    },
    [navigate, selectedGroup?.id]
  )

  const handleCreateGroup = useCallback((): void => {
    setConfigDialogMode('create')
    setConfigError(null)
    setIsConfigDialogOpen(true)
  }, [])

  const handleCreateThread = useCallback(async (): Promise<void> => {
    if (!selectedGroup) {
      return
    }

    setIsCreatingThread(true)
    setLoadError(null)

    try {
      const thread = await createGroupThread({
        groupId: selectedGroup.id,
        resourceId: profileId
      })

      setThreads((currentThreads) => sortGroupThreadsByRecentActivity([thread, ...currentThreads]))
      navigate(routeToGroup(selectedGroup.id, thread.id))
    } catch (error) {
      setLoadError(toErrorMessage(error))
    } finally {
      setIsCreatingThread(false)
    }
  }, [navigate, profileId, selectedGroup])

  const handleDeleteThread = useCallback(
    async (thread: GroupThreadRecord): Promise<void> => {
      setDeletingThreadId(thread.id)
      setLoadError(null)

      try {
        await deleteGroupThread(thread.id)
        setThreads((currentThreads) =>
          currentThreads.filter((currentThread) => currentThread.id !== thread.id)
        )

        if (params.threadId === thread.id) {
          navigate(routeToGroup(thread.groupId), { replace: true })
        }
      } catch (error) {
        setLoadError(toErrorMessage(error))
      } finally {
        setDeletingThreadId(null)
      }
    },
    [navigate, params.threadId]
  )

  const handleSubmitConfig = useCallback(
    async (input: GroupConfigDialogValues): Promise<void> => {
      setIsSavingConfig(true)
      setConfigError(null)

      try {
        if (configDialogMode === 'create') {
          const group = await createGroup({
            name: input.name,
            assistantIds: input.assistantIds
          })
          setGroups((currentGroups) => [group, ...currentGroups])
          setSelectedMemberIds(input.assistantIds)
          setIsConfigDialogOpen(false)
          setConfigDialogMode('edit')
          navigate(routeToGroup(group.id))
          return
        }

        if (!selectedGroup) {
          return
        }

        const updatedGroup = await updateGroup(selectedGroup.id, {
          name: input.name,
          groupDescription: input.groupDescription,
          maxAutoTurns: input.maxAutoTurns
        })
        await replaceGroupMembers(selectedGroup.id, input.assistantIds)
        setGroups((currentGroups) =>
          currentGroups.map((group) =>
            group.id === updatedGroup.id ? updatedGroup : group
          )
        )
        setSelectedMemberIds(input.assistantIds)
        setIsConfigDialogOpen(false)
      } catch (error) {
        setConfigError(toErrorMessage(error))
      } finally {
        setIsSavingConfig(false)
      }
    },
    [configDialogMode, navigate, selectedGroup]
  )

  const handleSubmitMessage = useCallback(
    async (input: { messageText: string; mentions: string[] }): Promise<void> => {
      if (!selectedThread || !readiness.canChat) {
        return
      }

      const nextMessage = input.messageText.trim()
      if (nextMessage.length === 0) {
        return
      }

      setIsSubmittingMessage(true)
      setLoadError(null)
      setStatusEvents([])
      setActiveSpeakerName(null)
      setIsAgentTyping(false)

      try {
        const result = await submitGroupWatcherMessage({
          threadId: selectedThread.id,
          profileId: selectedThreadProfileId,
          content: nextMessage,
          mentions: input.mentions
        })
        setActiveRunId(result.runId)
        const now = new Date().toISOString()
        markThreadActive(selectedThread.id, now)
        void refreshThreadHistory({
          threadId: selectedThread.id,
          profileId: selectedThreadProfileId,
          fallbackTimestamp: now
        })
      } catch (error) {
        setLoadError(toErrorMessage(error))
      } finally {
        setIsSubmittingMessage(false)
      }
    },
    [markThreadActive, readiness.canChat, refreshThreadHistory, selectedThread, selectedThreadProfileId]
  )

  return {
    groups,
    threads,
    assistants,
    selectedGroup,
    selectedThread,
    selectedMemberIds,
    selectedMembers,
    messages,
    readiness,
    statusEvents,
    activeRunId,
    activeSpeakerName,
    isAgentTyping,
    isLoadingData,
    isLoadingThreads,
    isLoadingMessages,
    isCreatingGroup,
    isCreatingThread,
    isSubmittingMessage,
    deletingThreadId,
    isConfigDialogOpen,
    configDialogMode,
    isSavingConfig,
    configError,
    loadError,
    handleSelectGroup,
    handleSelectThread,
    handleCreateGroup,
    handleCreateThread,
    handleDeleteThread,
    handleSubmitConfig,
    handleSubmitMessage,
    openConfigDialog: () => {
      if (!selectedGroup) {
        return
      }

      setConfigDialogMode('edit')
      setConfigError(null)
      setIsConfigDialogOpen(true)
    },
    closeConfigDialog: () => {
      if (isSavingConfig) {
        return
      }

      setConfigError(null)
      setIsConfigDialogOpen(false)
    }
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listAssistants,
  type AssistantRecord
} from '../../assistants/assistants-query'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'
import { getActiveResourceId } from '../../threads/threads-query'
import { toErrorMessage } from '../../threads/thread-page-routing'
import {
  createTeamChatTransport,
  listTeamThreadMessages
} from '../team-chat-query'
import {
  createTeamThread,
  listTeamThreadMembers,
  listTeamThreads,
  replaceTeamThreadMembers,
  updateTeamThread,
  type TeamThreadRecord
} from '../team-threads-query'
import { openTeamStatusStream, type TeamStatusEvent, type TeamStatusStreamHandle } from '../team-status-stream'
import {
  createTeamWorkspace,
  listTeamWorkspaces,
  type TeamWorkspaceRecord
} from '../team-workspaces-query'
import type { TeamConfigDialogValues } from '../components/team-config-dialog'

type TeamReadinessCheckId = 'thread' | 'workspace' | 'provider' | 'model' | 'members'

export type TeamReadinessCheck = {
  id: TeamReadinessCheckId
  label: string
  ready: boolean
}

export type TeamReadiness = {
  canChat: boolean
  checks: TeamReadinessCheck[]
}

export type TeamPageController = ReturnType<typeof useTeamPageController>

function routeToTeam(workspaceId?: string | null, threadId?: string | null): string {
  if (workspaceId && threadId) {
    return `/team/${workspaceId}/${threadId}`
  }

  if (workspaceId) {
    return `/team/${workspaceId}`
  }

  return '/team'
}

function createWorkspaceName(rootPath: string): string {
  const segments = rootPath.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? 'Team Workspace'
}

function sortTeamThreadsByRecentActivity(threads: TeamThreadRecord[]): TeamThreadRecord[] {
  return [...threads].sort((left, right) => {
    const leftDate = Date.parse(left.lastMessageAt ?? left.createdAt)
    const rightDate = Date.parse(right.lastMessageAt ?? right.createdAt)
    return rightDate - leftDate
  })
}

function evaluateTeamReadiness(input: {
  selectedWorkspace: TeamWorkspaceRecord | null
  selectedThread: TeamThreadRecord | null
  providers: ProviderRecord[]
  selectedMemberIds: string[]
  selectedMembers: AssistantRecord[]
}): TeamReadiness {
  const selectedProvider =
    input.selectedThread?.supervisorProviderId && input.selectedThread.supervisorProviderId.length > 0
      ? (input.providers.find((provider) => provider.id === input.selectedThread?.supervisorProviderId) ??
        null)
      : null

  const checks: TeamReadinessCheck[] = [
    {
      id: 'thread',
      label: 'Team thread is selected',
      ready: Boolean(input.selectedThread)
    },
    {
      id: 'workspace',
      label: 'Workspace path is configured',
      ready: Boolean(input.selectedWorkspace?.rootPath.trim())
    },
    {
      id: 'provider',
      label: 'Supervisor provider is configured',
      ready: Boolean(selectedProvider)
    },
    {
      id: 'model',
      label: 'Supervisor model is configured',
      ready: Boolean(input.selectedThread?.supervisorModel.trim())
    },
    {
      id: 'members',
      label: 'At least one live team member is selected',
      ready: input.selectedMemberIds.length > 0 && input.selectedMembers.length > 0
    }
  ]

  return {
    canChat: checks.every((check) => check.ready),
    checks
  }
}

export function useTeamPageController() {
  const params = useParams()
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<TeamWorkspaceRecord[]>([])
  const [threads, setThreads] = useState<TeamThreadRecord[]>([])
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [statusEvents, setStatusEvents] = useState<TeamStatusEvent[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false)
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const statusStreamRef = useRef<TeamStatusStreamHandle | null>(null)
  const profileId = useMemo(() => getActiveResourceId(), [])

  const selectedWorkspace = useMemo(() => {
    const workspaceId = params.workspaceId
    if (!workspaceId) {
      return null
    }

    return workspaces.find((workspace) => workspace.id === workspaceId) ?? null
  }, [params.workspaceId, workspaces])

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

  const readiness = useMemo(() => {
    return evaluateTeamReadiness({
      selectedWorkspace,
      selectedThread,
      providers,
      selectedMemberIds,
      selectedMembers
    })
  }, [providers, selectedMemberIds, selectedMembers, selectedThread, selectedWorkspace])

  const handleRunStarted = useCallback(
    (runId: string) => {
      if (!selectedThread) {
        return
      }

      setActiveRunId(runId)
      setStatusEvents([])
      statusStreamRef.current?.close()
      const nextStatusStream = openTeamStatusStream({
        threadId: selectedThread.id,
        runId,
        onEvent: (event) => {
          setStatusEvents((current) => [...current, event])
        },
        onError: (error) => {
          setLoadError(toErrorMessage(error))
        }
      })
      statusStreamRef.current = nextStatusStream
    },
    [selectedThread]
  )

  const chatTransport = useMemo(() => {
    if (!selectedThread) {
      return undefined
    }

    return createTeamChatTransport({
      threadId: selectedThread.id,
      profileId,
      onRunStarted: handleRunStarted
    })
  }, [handleRunStarted, profileId, selectedThread])

  const chat = useChat({
    id: selectedThread ? `team:${selectedThread.id}` : 'team-chat',
    transport: chatTransport,
    resume: Boolean(selectedThread && chatTransport),
    experimental_throttle: 48,
    onFinish: () => {
      if (!selectedThread) {
        return
      }

      const now = new Date().toISOString()
      setThreads((currentThreads) =>
        sortTeamThreadsByRecentActivity(
          currentThreads.map((thread) =>
            thread.id === selectedThread.id
              ? {
                  ...thread,
                  lastMessageAt: now,
                  updatedAt: now
                }
              : thread
          )
        )
      )
    }
  })

  const { sendMessage, setMessages, stop, status: chatStatus, error: chatError } = chat
  const isChatStreaming = chatStatus === 'submitted' || chatStatus === 'streaming'
  const canAbortGeneration = isChatStreaming

  useEffect(() => {
    return () => {
      statusStreamRef.current?.close()
    }
  }, [])

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setIsLoadingData(true)
      setLoadError(null)

      try {
        const [workspacesResult, assistantsResult, providersResult] = await Promise.all([
          listTeamWorkspaces(),
          listAssistants(),
          listProviders()
        ])

        setWorkspaces(workspacesResult)
        setAssistants(assistantsResult)
        setProviders(providersResult)
      } catch (error) {
        setLoadError(toErrorMessage(error))
      } finally {
        setIsLoadingData(false)
      }
    }

    void loadData()
  }, [])

  useEffect(() => {
    if (isLoadingData) {
      return
    }

    if (workspaces.length === 0) {
      return
    }

    if (selectedWorkspace) {
      return
    }

    navigate(routeToTeam(workspaces[0]?.id ?? null), { replace: true })
  }, [isLoadingData, navigate, selectedWorkspace, workspaces])

  useEffect(() => {
    if (!selectedWorkspace) {
      setThreads([])
      return
    }

    let active = true
    setIsLoadingThreads(true)
    setLoadError(null)

    void listTeamThreads(selectedWorkspace.id)
      .then((nextThreads) => {
        if (!active) {
          return
        }

        setThreads(sortTeamThreadsByRecentActivity(nextThreads))
      })
      .catch((error) => {
        if (active) {
          setLoadError(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingThreads(false)
        }
      })

    return () => {
      active = false
    }
  }, [selectedWorkspace])

  useEffect(() => {
    if (!selectedWorkspace || !params.threadId) {
      return
    }

    if (selectedThread) {
      return
    }

    if (isLoadingThreads) {
      return
    }

    navigate(routeToTeam(selectedWorkspace.id), { replace: true })
  }, [isLoadingThreads, navigate, params.threadId, selectedThread, selectedWorkspace])

  useEffect(() => {
    if (!selectedThread) {
      setSelectedMemberIds([])
      setIsLoadingChatHistory(false)
      setMessages([])
      setStatusEvents([])
      setActiveRunId(null)
      statusStreamRef.current?.close()
      statusStreamRef.current = null
      return
    }

    let active = true
    setIsLoadingChatHistory(true)
    setStatusEvents([])
    setActiveRunId(null)
    statusStreamRef.current?.close()
    statusStreamRef.current = null

    void Promise.all([
      listTeamThreadMembers(selectedThread.id),
      listTeamThreadMessages({
        threadId: selectedThread.id,
        profileId
      })
    ])
      .then(([members, messages]) => {
        if (!active) {
          return
        }

        setSelectedMemberIds(members.map((member) => member.assistantId))
        setMessages(messages)
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setSelectedMemberIds([])
        setMessages([])
        setLoadError(toErrorMessage(error))
      })
      .finally(() => {
        if (active) {
          setIsLoadingChatHistory(false)
        }
      })

    return () => {
      active = false
    }
  }, [profileId, selectedThread, setMessages])

  const selectWorkspacePath = useCallback(async (): Promise<string | null> => {
    const picker = window.tiaDesktop?.pickDirectory
    if (!picker) {
      return null
    }

    return picker()
  }, [])

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      navigate(routeToTeam(workspaceId))
    },
    [navigate]
  )

  const handleSelectThread = useCallback(
    (threadId: string) => {
      navigate(routeToTeam(selectedWorkspace?.id ?? null, threadId))
    },
    [navigate, selectedWorkspace?.id]
  )

  const handleCreateWorkspace = useCallback(async (): Promise<void> => {
    setIsCreatingWorkspace(true)
    setLoadError(null)

    try {
      const rootPath = await selectWorkspacePath()
      if (!rootPath) {
        return
      }

      const workspace = await createTeamWorkspace({
        name: createWorkspaceName(rootPath),
        rootPath
      })

      setWorkspaces((current) => [workspace, ...current])
      navigate(routeToTeam(workspace.id))
    } catch (error) {
      setLoadError(toErrorMessage(error))
    } finally {
      setIsCreatingWorkspace(false)
    }
  }, [navigate, selectWorkspacePath])

  const handleCreateThread = useCallback(async (): Promise<void> => {
    if (!selectedWorkspace) {
      return
    }

    setIsCreatingThread(true)
    setLoadError(null)

    try {
      const thread = await createTeamThread({
        workspaceId: selectedWorkspace.id,
        resourceId: profileId,
        title: 'New Team Thread'
      })

      setThreads((currentThreads) => sortTeamThreadsByRecentActivity([thread, ...currentThreads]))
      navigate(routeToTeam(selectedWorkspace.id, thread.id))
    } catch (error) {
      setLoadError(toErrorMessage(error))
    } finally {
      setIsCreatingThread(false)
    }
  }, [navigate, profileId, selectedWorkspace])

  const handleSubmitConfig = useCallback(
    async (input: TeamConfigDialogValues): Promise<void> => {
      if (!selectedThread) {
        return
      }

      setIsSavingConfig(true)
      setConfigError(null)

      try {
        const updatedThread = await updateTeamThread(selectedThread.id, {
          title: input.title,
          teamDescription: input.teamDescription,
          supervisorProviderId: input.supervisorProviderId,
          supervisorModel: input.supervisorModel
        })
        await replaceTeamThreadMembers(selectedThread.id, input.assistantIds)
        setThreads((currentThreads) =>
          currentThreads.map((thread) => (thread.id === updatedThread.id ? updatedThread : thread))
        )
        setSelectedMemberIds(input.assistantIds)
        setIsConfigDialogOpen(false)
      } catch (error) {
        setConfigError(toErrorMessage(error))
      } finally {
        setIsSavingConfig(false)
      }
    },
    [selectedThread]
  )

  const handleSubmitMessage = useCallback(
    async (messageText: string): Promise<void> => {
      if (!selectedThread || !readiness.canChat) {
        return
      }

      const nextMessage = messageText.trim()
      if (nextMessage.length === 0) {
        return
      }

      await sendMessage({
        text: nextMessage
      })
    },
    [readiness.canChat, selectedThread, sendMessage]
  )

  const handleAbortGeneration = useCallback(() => {
    if (!isChatStreaming) {
      return
    }

    void stop()
  }, [isChatStreaming, stop])

  return {
    workspaces,
    threads,
    assistants,
    providers,
    selectedWorkspace,
    selectedThread,
    selectedMemberIds,
    selectedMembers,
    readiness,
    statusEvents,
    activeRunId,
    chat,
    isLoadingData,
    isLoadingThreads,
    isLoadingChatHistory,
    isCreatingWorkspace,
    isCreatingThread,
    isConfigDialogOpen,
    isSavingConfig,
    configError,
    loadError,
    chatError,
    isChatStreaming,
    canAbortGeneration,
    handleSelectWorkspace,
    handleSelectThread,
    handleCreateWorkspace,
    handleCreateThread,
    handleSubmitConfig,
    handleSubmitMessage,
    handleAbortGeneration,
    openConfigDialog: () => {
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

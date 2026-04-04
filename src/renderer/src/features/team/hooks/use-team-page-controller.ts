import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useNavigate, useParams } from 'react-router-dom'
import { i18n } from '../../../i18n'
import { listAssistants, type AssistantRecord } from '../../assistants/assistants-query'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'
import { isModelProviderType } from '../../settings/providers/provider-type-options'
import { getActiveResourceId } from '../../threads/threads-query'
import { toErrorMessage } from '../../threads/thread-page-routing'
import { createTeamChatTransport, listTeamThreadMessages } from '../team-chat-query'
import {
  createTeamThread,
  deleteTeamThread,
  listTeamThreads,
  type TeamThreadRecord
} from '../team-threads-query'
import {
  openTeamStatusStream,
  type TeamStatusEvent,
  type TeamStatusStreamHandle
} from '../team-status-stream'
import {
  createTeamWorkspace,
  listTeamWorkspaceMembers,
  listTeamWorkspaces,
  replaceTeamWorkspaceMembers,
  updateTeamWorkspace,
  type TeamWorkspaceRecord
} from '../team-workspaces-query'
import type { TeamConfigDialogValues } from '../components/team-config-dialog'
import {
  readStoredTeamSelection,
  routeToTeam,
  sortTeamThreadsByRecentActivity,
  storeTeamSelection
} from '../team-page-routing'

type TeamReadinessCheckId = 'workspace' | 'provider' | 'model' | 'members'

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

type PendingTeamMessage = {
  threadId: string
  text: string
}

function createWorkspaceName(rootPath: string): string {
  const segments = rootPath.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? i18n.t('team.sidebar.defaultWorkspaceName')
}

function hasNonEmptyText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function evaluateTeamReadiness(input: {
  selectedWorkspace: TeamWorkspaceRecord | null
  providers: ProviderRecord[]
  selectedMemberIds: string[]
  selectedMembers: AssistantRecord[]
}): TeamReadiness {
  const selectedProvider =
    input.selectedWorkspace?.supervisorProviderId &&
    input.selectedWorkspace.supervisorProviderId.length > 0
      ? (input.providers.find(
          (provider) => provider.id === input.selectedWorkspace?.supervisorProviderId
        ) ?? null)
      : null

  const checks: TeamReadinessCheck[] = [
    {
      id: 'workspace',
      label: i18n.t('team.readiness.workspaceConfigured'),
      ready: hasNonEmptyText(input.selectedWorkspace?.rootPath)
    },
    {
      id: 'provider',
      label: i18n.t('team.readiness.providerConfigured'),
      ready: Boolean(selectedProvider)
    },
    {
      id: 'model',
      label: i18n.t('team.readiness.modelConfigured'),
      ready: hasNonEmptyText(input.selectedWorkspace?.supervisorModel)
    },
    {
      id: 'members',
      label: i18n.t('team.readiness.membersSelected'),
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
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const statusStreamRef = useRef<TeamStatusStreamHandle | null>(null)
  const pendingTeamMessageRef = useRef<PendingTeamMessage | null>(null)
  const hasLoadedInitialMessagesRef = useRef(false)
  const [hasPendingMessage, setHasPendingMessage] = useState(false)
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
      providers,
      selectedMemberIds,
      selectedMembers
    })
  }, [providers, selectedMemberIds, selectedMembers, selectedWorkspace])
  const selectedThreadProfileId = selectedThread?.resourceId ?? profileId

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
      profileId: selectedThreadProfileId,
      onRunStarted: handleRunStarted
    })
  }, [handleRunStarted, selectedThread, selectedThreadProfileId])

  const chat = useChat({
    id: selectedThread ? `team:${selectedThread.id}` : 'team-chat',
    transport: chatTransport,
    resume: false,
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
        setProviders(providersResult.filter((provider) => isModelProviderType(provider.type)))
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

    const storedSelection = readStoredTeamSelection()
    if (storedSelection) {
      const matchedWorkspace = workspaces.find(
        (workspace) => workspace.id === storedSelection.workspaceId
      )

      if (matchedWorkspace) {
        navigate(routeToTeam(matchedWorkspace.id, storedSelection.threadId), { replace: true })
        return
      }
    }

    navigate(routeToTeam(workspaces[0]?.id ?? null), { replace: true })
  }, [isLoadingData, navigate, selectedWorkspace, workspaces])

  useEffect(() => {
    if (!selectedWorkspace) {
      return
    }

    storeTeamSelection({
      workspaceId: selectedWorkspace.id,
      threadId: selectedThread?.id ?? null
    })
  }, [selectedThread?.id, selectedWorkspace])

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
    if (!selectedWorkspace) {
      setSelectedMemberIds([])
      return
    }

    let active = true
    void listTeamWorkspaceMembers(selectedWorkspace.id)
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
  }, [selectedWorkspace])

  useEffect(() => {
    if (!selectedWorkspace?.isBuiltInDefault) {
      return
    }

    setSelectedMemberIds(assistants.map((assistant) => assistant.id))
  }, [assistants, selectedWorkspace?.isBuiltInDefault])

  useEffect(() => {
    if (!selectedThread) {
      setIsLoadingChatHistory(false)
      setMessages([])
      hasLoadedInitialMessagesRef.current = false
      setStatusEvents([])
      setActiveRunId(null)
      statusStreamRef.current?.close()
      statusStreamRef.current = null
      return
    }

    let active = true
    setIsLoadingChatHistory(true)
    hasLoadedInitialMessagesRef.current = false
    setStatusEvents([])
    setActiveRunId(null)
    statusStreamRef.current?.close()
    statusStreamRef.current = null

    void listTeamThreadMessages({
      threadId: selectedThread.id,
      profileId: selectedThreadProfileId
    })
      .then((messages) => {
        if (!active) {
          return
        }

        setMessages(messages)
        hasLoadedInitialMessagesRef.current = true
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setMessages([])
        hasLoadedInitialMessagesRef.current = true
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
  }, [selectedThread, selectedThreadProfileId, setMessages])

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
      setConfigError(null)
      setIsConfigDialogOpen(true)
    } catch (error) {
      setLoadError(toErrorMessage(error))
    } finally {
      setIsCreatingWorkspace(false)
    }
  }, [navigate, selectWorkspacePath])

  const createNewThread = useCallback(async (): Promise<TeamThreadRecord | null> => {
    if (!selectedWorkspace) {
      return null
    }

    setIsCreatingThread(true)
    setLoadError(null)

    try {
      const thread = await createTeamThread({
        workspaceId: selectedWorkspace.id,
        resourceId: profileId
      })

      setThreads((currentThreads) => sortTeamThreadsByRecentActivity([thread, ...currentThreads]))
      navigate(routeToTeam(selectedWorkspace.id, thread.id))
      return thread
    } catch (error) {
      setLoadError(toErrorMessage(error))
      return null
    } finally {
      setIsCreatingThread(false)
    }
  }, [navigate, profileId, selectedWorkspace])

  const handleCreateThread = useCallback(async (): Promise<void> => {
    await createNewThread()
  }, [createNewThread])

  const handleDeleteThread = useCallback(
    async (thread: TeamThreadRecord): Promise<void> => {
      setDeletingThreadId(thread.id)
      setLoadError(null)

      try {
        await deleteTeamThread(thread.id)
        setThreads((currentThreads) =>
          currentThreads.filter((currentThread) => currentThread.id !== thread.id)
        )

        if (params.threadId === thread.id) {
          navigate(routeToTeam(thread.workspaceId), { replace: true })
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
    async (input: TeamConfigDialogValues): Promise<void> => {
      if (!selectedWorkspace) {
        return
      }

      setIsSavingConfig(true)
      setConfigError(null)

      try {
        const updatedWorkspace = await updateTeamWorkspace(selectedWorkspace.id, {
          teamDescription: input.teamDescription,
          supervisorProviderId: input.supervisorProviderId,
          supervisorModel: input.supervisorModel
        })
        const effectiveAssistantIds = selectedWorkspace.isBuiltInDefault
          ? assistants.map((assistant) => assistant.id)
          : input.assistantIds
        await replaceTeamWorkspaceMembers(selectedWorkspace.id, effectiveAssistantIds)
        setWorkspaces((currentWorkspaces) =>
          currentWorkspaces.map((workspace) =>
            workspace.id === updatedWorkspace.id ? updatedWorkspace : workspace
          )
        )
        setSelectedMemberIds(effectiveAssistantIds)
        setIsConfigDialogOpen(false)
      } catch (error) {
        setConfigError(toErrorMessage(error))
      } finally {
        setIsSavingConfig(false)
      }
    },
    [assistants, selectedWorkspace]
  )

  const handleSubmitMessage = useCallback(
    async (messageText: string): Promise<void> => {
      if (!selectedWorkspace || !readiness.canChat) {
        return
      }

      const nextMessage = messageText.trim()
      if (nextMessage.length === 0) {
        return
      }

      const queuePendingMessage = (threadId: string, text: string): void => {
        pendingTeamMessageRef.current = {
          threadId,
          text
        }
        setHasPendingMessage(true)
      }

      if (selectedThread) {
        if (!chatTransport || isLoadingChatHistory || !hasLoadedInitialMessagesRef.current) {
          queuePendingMessage(selectedThread.id, nextMessage)
          return
        }

        await sendMessage({
          text: nextMessage
        })
        return
      }

      const createdThread = await createNewThread()
      if (!createdThread) {
        return
      }

      queuePendingMessage(createdThread.id, nextMessage)
    },
    [
      chatTransport,
      createNewThread,
      isLoadingChatHistory,
      readiness.canChat,
      selectedThread,
      selectedWorkspace,
      sendMessage
    ]
  )

  useEffect(() => {
    if (!hasPendingMessage) {
      return
    }

    const pendingMessage = pendingTeamMessageRef.current
    if (!pendingMessage) {
      return
    }

    if (!selectedThread || selectedThread.id !== pendingMessage.threadId) {
      return
    }

    if (isLoadingChatHistory) {
      return
    }

    if (!chatTransport || !hasLoadedInitialMessagesRef.current) {
      return
    }

    const messageToSend = pendingMessage.text
    pendingTeamMessageRef.current = null
    setHasPendingMessage(false)

    void sendMessage({
      text: messageToSend
    }).catch((error) => {
      setLoadError(toErrorMessage(error))
    })
  }, [chatTransport, hasPendingMessage, isLoadingChatHistory, selectedThread, sendMessage])

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
    deletingThreadId,
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
    handleDeleteThread,
    handleSubmitConfig,
    handleSubmitMessage,
    handleAbortGeneration,
    openConfigDialog: () => {
      if (!selectedWorkspace) {
        return
      }

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

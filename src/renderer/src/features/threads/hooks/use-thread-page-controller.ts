import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  assistantKeys,
  useAssistants,
  useCreateAssistant,
  useUpdateAssistant,
  useDeleteAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../../assistants/assistants-query'
import {
  readAutoLocalAcpAgentKey,
  syncInstalledLocalAcpAgents
} from '../../assistants/local-acp-assistant-sync'
import {
  updateAssistantHeartbeat,
  type SaveAssistantHeartbeatInput
} from '../../assistants/assistant-heartbeat-query'
import type { AssistantManagementDialogMode } from '../../claws/components/assistant-management-dialog'
import {
  approveClawPairing,
  clawKeys,
  createClawChannel,
  deleteClawChannel,
  getClawChannelAuthState,
  listClawPairings,
  listClaws,
  rejectClawPairing,
  revokeClawPairing,
  updateClaw,
  updateClawChannel,
  useClaws,
  type ClawChannelAuthRecord,
  type ClawPairingRecord,
  type ClawRecord,
  type ClawsResponse,
  type ConfiguredClawChannelRecord,
  type CreateClawChannelInput,
  type UpdateClawChannelInput
} from '../../claws/claws-query'
import {
  getMcpServersSettings,
  type McpServerRecord
} from '../../settings/mcp-servers/mcp-servers-query'
import {
  providerKeys,
  useProviders
} from '../../settings/providers/providers-query'
import {
  useThreads,
  useCreateThread,
  useDeleteThread,
  getActiveResourceId,
  listThreads,
  type ThreadRecord
} from '../threads-query'
import {
  openAssistantMessageEventsStream,
  createThreadChatTransport,
  listThreadChatMessages,
  runThreadCommand
} from '../chat-query'
import {
  buildAssistantThreadBranches,
  evaluateAssistantReadiness,
  resolveVisibleThreads
} from '../thread-page-helpers'
import {
  createThreadTitle,
  findLatestThreadAcrossAssistants,
  readStoredChatSelection,
  routeToAssistantThreads,
  sortThreadsByRecentActivity,
  storeChatSelection,
  toErrorMessage
} from '../thread-page-routing'
import { queryClient } from '../../../lib/query-client'
import { listInstalledLocalAcpAgents } from '../local-acp-agents-query'

type PendingThreadMessage = {
  threadId: string
  message: UIMessage
}

const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'
function emptyClawsResponse(): ClawsResponse {
  return {
    claws: [],
    configuredChannels: []
  }
}

function buildChannelPayload(
  currentChannelId: string,
  selectedChannelId: string
):
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
  | undefined {
  if (selectedChannelId.length === 0) {
    return currentChannelId.length > 0 ? { mode: 'detach' } : undefined
  }

  if (currentChannelId === selectedChannelId) {
    return currentChannelId.length > 0 ? { mode: 'keep' } : undefined
  }

  return {
    mode: 'attach',
    channelId: selectedChannelId
  }
}

function supportsChannelAccess(channelType: string | null | undefined): boolean {
  return channelType === 'telegram' || channelType === 'whatsapp' || channelType === 'wechat'
}

function createPendingUserMessage(threadId: string, text: string): UIMessage {
  const messageId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return {
    id: `pending-user:${threadId}:${messageId}`,
    role: 'user',
    parts: [
      {
        type: 'text',
        text
      }
    ]
  }
}

function mergeDisplayedThreadMessages(input: {
  persistedMessages: UIMessage[]
  currentMessages: readonly UIMessage[]
  pendingUserMessage: UIMessage | null
}): UIMessage[] {
  const merged: UIMessage[] = []
  const seenMessageIds = new Set<string>()

  const appendIfNew = (message: UIMessage | null | undefined): void => {
    if (!message) {
      return
    }

    const messageId = typeof message.id === 'string' ? message.id : ''
    if (messageId.length > 0 && seenMessageIds.has(messageId)) {
      return
    }

    merged.push(message)
    if (messageId.length > 0) {
      seenMessageIds.add(messageId)
    }
  }

  input.persistedMessages.forEach(appendIfNew)
  appendIfNew(input.pendingUserMessage)

  for (const message of input.currentMessages) {
    if (message.role === 'assistant') {
      appendIfNew(message)
      continue
    }

    if (input.pendingUserMessage && message.id === input.pendingUserMessage.id) {
      appendIfNew(message)
    }
  }

  return merged
}

export type ThreadPageController = ReturnType<typeof useThreadPageController>

export function useThreadPageController() {
  const { t } = useTranslation()
  const params = useParams()
  const navigate = useNavigate()

  // TanStack Query hooks for data fetching
  const {
    data: assistants = [],
    isLoading: isLoadingAssistants,
    error: assistantsError
  } = useAssistants()
  const {
    data: allProviders = [],
    isLoading: isLoadingProviders,
    error: providersError
  } = useProviders()
  const { data: clawsData = emptyClawsResponse(), isLoading: isLoadingClaws } = useClaws()
  const createAssistantMutation = useCreateAssistant()
  const updateAssistantMutation = useUpdateAssistant()
  const deleteAssistantMutation = useDeleteAssistant()
  const createThreadMutation = useCreateThread()
  const deleteThreadMutation = useDeleteThread()
  const [installedLocalAcpAgents, setInstalledLocalAcpAgents] = useState<
    Awaited<ReturnType<typeof listInstalledLocalAcpAgents>>
  >([])
  const [isLoadingInstalledLocalAcpAgents, setIsLoadingInstalledLocalAcpAgents] = useState(true)
  const [isSyncingInstalledLocalAcpTargets, setIsSyncingInstalledLocalAcpTargets] = useState(false)

  // Filter to only show enabled providers
  const providers = useMemo(
    () => allProviders.filter((provider) => provider.enabled),
    [allProviders]
  )
  const installedLocalAcpAgentKeys = useMemo(
    () => new Set<string>(installedLocalAcpAgents.map((agent) => agent.key)),
    [installedLocalAcpAgents]
  )
  const visibleAssistants = useMemo(
    () =>
      assistants
        .filter((assistant) => {
          const autoLocalAcpAgentKey = readAutoLocalAcpAgentKey(assistant.workspaceConfig)
          return !autoLocalAcpAgentKey || installedLocalAcpAgentKeys.has(autoLocalAcpAgentKey)
        })
        .sort((left, right) => {
          const leftAutoLocalAcpAgentKey = readAutoLocalAcpAgentKey(left.workspaceConfig)
          const rightAutoLocalAcpAgentKey = readAutoLocalAcpAgentKey(right.workspaceConfig)
          const leftInstalledIndex =
            leftAutoLocalAcpAgentKey === null
              ? Number.POSITIVE_INFINITY
              : installedLocalAcpAgents.findIndex((agent) => agent.key === leftAutoLocalAcpAgentKey)
          const rightInstalledIndex =
            rightAutoLocalAcpAgentKey === null
              ? Number.POSITIVE_INFINITY
              : installedLocalAcpAgents.findIndex((agent) => agent.key === rightAutoLocalAcpAgentKey)

          if (leftInstalledIndex !== rightInstalledIndex) {
            return leftInstalledIndex - rightInstalledIndex
          }

          return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        }),
    [assistants, installedLocalAcpAgentKeys, installedLocalAcpAgents]
  )

  // Local state for MCP servers (not yet migrated to TanStack Query)
  const [mcpServers, setMcpServers] = useState<Record<string, McpServerRecord>>({})

  // Local state for threads (will be replaced by useThreads hook)
  const [threads, setThreads] = useState<ThreadRecord[]>([])

  // Derived loading states
  const isLoadingData =
    isLoadingAssistants ||
    isLoadingProviders ||
    isLoadingInstalledLocalAcpAgents ||
    isSyncingInstalledLocalAcpTargets
  const loadError = assistantsError
    ? toErrorMessage(assistantsError)
    : providersError
      ? toErrorMessage(providersError)
      : null

  // UI state
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false)
  const [assistantDialogMode, setAssistantDialogMode] =
    useState<AssistantManagementDialogMode>('edit')
  const [assistantDialogAssistantId, setAssistantDialogAssistantId] = useState<string | null>(null)
  const [assistantDialogChannelIdOverride, setAssistantDialogChannelIdOverride] = useState<
    string | null
  >(null)
  const [isAssistantDialogOpen, setIsAssistantDialogOpen] = useState(false)
  const [assistantDialogError, setAssistantDialogError] = useState<string | null>(null)
  const [isAssistantChannelMutating, setIsAssistantChannelMutating] = useState(false)
  const [channelAccessClaw, setChannelAccessClaw] = useState<ClawRecord | null>(null)
  const [channelAccessPairings, setChannelAccessPairings] = useState<ClawPairingRecord[]>([])
  const [isChannelAccessLoading, setIsChannelAccessLoading] = useState(false)
  const [channelAuthState, setChannelAuthState] = useState<ClawChannelAuthRecord | null>(null)
  const [isChannelAuthLoading, setIsChannelAuthLoading] = useState(false)
  const [isChannelAccessSubmitting, setIsChannelAccessSubmitting] = useState(false)
  const [channelAccessError, setChannelAccessError] = useState<string | null>(null)
  const [heartbeatMonitorAssistant, setHeartbeatMonitorAssistant] =
    useState<AssistantRecord | null>(null)
  const [cronMonitorAssistant, setCronMonitorAssistant] = useState<AssistantRecord | null>(null)
  const pendingThreadMessageRef = useRef<PendingThreadMessage | null>(null)
  const activePendingUserMessagesRef = useRef(new Map<string, UIMessage>())
  const [hasPendingMessage, setHasPendingMessage] = useState(false)
  const hasLoadedInitialMessagesRef = useRef(false)
  const connectedAuthRefreshKeyRef = useRef<string | null>(null)
  const profileId = useMemo(() => getActiveResourceId(), [])

  const selectedAssistant = useMemo(() => {
    const assistantId = params.assistantId
    if (!assistantId) {
      return null
    }

    return visibleAssistants.find((assistant) => assistant.id === assistantId) ?? null
  }, [params.assistantId, visibleAssistants])

  const assistantDialogAssistant = useMemo(() => {
    if (assistantDialogMode !== 'edit') {
      return null
    }

    if (assistantDialogAssistantId) {
      return visibleAssistants.find((assistant) => assistant.id === assistantDialogAssistantId) ?? null
    }

    return selectedAssistant
  }, [assistantDialogAssistantId, assistantDialogMode, selectedAssistant, visibleAssistants])

  const assistantDialogCurrentClaw = useMemo(() => {
    if (assistantDialogMode !== 'edit' || !assistantDialogAssistant) {
      return null
    }

    return clawsData.claws.find((claw) => claw.id === assistantDialogAssistant.id) ?? null
  }, [assistantDialogAssistant, assistantDialogMode, clawsData.claws])

  const canManageAssistantChannels = useMemo(() => {
    if (assistantDialogMode === 'create') {
      return true
    }

    if (!assistantDialogAssistant) {
      return false
    }

    return assistantDialogAssistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] !== true
  }, [assistantDialogAssistant, assistantDialogMode])

  const assistantDialogSelectedChannelId =
    assistantDialogChannelIdOverride ?? assistantDialogCurrentClaw?.channel?.id ?? ''

  const selectedThread = useMemo(() => {
    if (!params.threadId) {
      return null
    }

    return threads.find((thread) => thread.id === params.threadId) ?? null
  }, [params.threadId, threads])
  const tokenUsage = useMemo(() => selectedThread?.usageTotals ?? null, [selectedThread])

  const readiness = useMemo(() => {
    return evaluateAssistantReadiness({
      assistant: selectedAssistant,
      providers
    })
  }, [providers, selectedAssistant])

  const supportsVision = useMemo(() => {
    if (!selectedAssistant) {
      return false
    }

    const provider = providers.find((p) => p.id === selectedAssistant.providerId)
    return provider?.supportsVision ?? false
  }, [providers, selectedAssistant])

  const sidebarBranches = useMemo(() => {
    return buildAssistantThreadBranches({
      assistants: visibleAssistants,
      selectedAssistantId: selectedAssistant?.id ?? null,
      threads
    })
  }, [selectedAssistant?.id, threads, visibleAssistants])

  const chatTransport = useMemo(() => {
    if (!selectedAssistant || !selectedThread) {
      return undefined
    }

    return createThreadChatTransport({
      assistantId: selectedAssistant.id,
      threadId: selectedThread.id,
      profileId
    })
  }, [profileId, selectedAssistant, selectedThread])

  const chat = useChat({
    id: selectedThread ? `${selectedAssistant?.id}:${selectedThread.id}` : 'default-chat',
    transport: chatTransport,
    resume: false,
    experimental_throttle: 48,
    onFinish: ({ isDisconnect, isError }) => {
      const selectedAssistantId = selectedAssistant?.id
      const selectedThreadId = selectedThread?.id

      if (selectedThreadId && isError && !isDisconnect) {
        activePendingUserMessagesRef.current.delete(selectedThreadId)
      }

      if (!selectedThreadId || !selectedAssistantId) {
        return
      }

      const now = new Date().toISOString()
      setThreads((currentThreads) => {
        const nextThreads = currentThreads.map((thread) =>
          thread.id === selectedThreadId
            ? {
                ...thread,
                lastMessageAt: now,
                updatedAt: now
              }
            : thread
        )
        return sortThreadsByRecentActivity(nextThreads)
      })

      void listThreads(selectedAssistantId)
        .then((latestThreads) => {
          setThreads(sortThreadsByRecentActivity(latestThreads))
        })
        .catch(() => undefined)
    }
  })

  const {
    sendMessage,
    setMessages,
    stop,
    resumeStream,
    status: chatStatus,
    error: chatError,
    messages: chatMessages
  } = chat
  const setMessagesRef = useRef(setMessages)
  const currentChatMessagesRef = useRef<readonly UIMessage[]>(chatMessages)
  type SendMessageInput = Exclude<Parameters<typeof sendMessage>[0], undefined>

  const isChatStreaming = chatStatus === 'submitted' || chatStatus === 'streaming'
  const canAbortGeneration = isChatStreaming

  const getDisplayedPendingUserMessage = useCallback((threadId: string): UIMessage | null => {
    const queuedPendingMessage = pendingThreadMessageRef.current
    if (queuedPendingMessage?.threadId === threadId) {
      return queuedPendingMessage.message
    }

    return activePendingUserMessagesRef.current.get(threadId) ?? null
  }, [])

  const mergeHydratedThreadMessages = useCallback(
    (threadId: string, persistedMessages: UIMessage[]) => {
      const activePendingUserMessage = activePendingUserMessagesRef.current.get(threadId)
      if (
        activePendingUserMessage &&
        persistedMessages.some((message) => message.id === activePendingUserMessage.id)
      ) {
        activePendingUserMessagesRef.current.delete(threadId)
      }

      return mergeDisplayedThreadMessages({
        persistedMessages,
        currentMessages: currentChatMessagesRef.current,
        pendingUserMessage: getDisplayedPendingUserMessage(threadId)
      })
    },
    [getDisplayedPendingUserMessage]
  )

  useEffect(() => {
    setMessagesRef.current = setMessages
    currentChatMessagesRef.current = chatMessages
  }, [chatMessages, setMessages])

  const sendQueuedPendingUserMessage = useCallback(
    async (message: UIMessage): Promise<void> => {
      if (typeof message.id !== 'string' || message.id.length === 0) {
        await sendMessage(message as SendMessageInput)
        return
      }

      // The queued first-message path preloads this message into useChat so it stays visible
      // while the thread hydrates. Send it as a replacement to avoid duplicating the same id.
      await sendMessage({
        ...(message as SendMessageInput),
        messageId: message.id
      } as SendMessageInput)
    },
    [sendMessage]
  )

  // Load MCP servers on mount
  useEffect(() => {
    void getMcpServersSettings()
      .then((result) => {
        setMcpServers(result.mcpServers)
      })
      .catch(() => {
        setMcpServers({})
      })
  }, [])

  useEffect(() => {
    let active = true
    setIsLoadingInstalledLocalAcpAgents(true)

    void listInstalledLocalAcpAgents()
      .then((nextAgents) => {
        if (!active) {
          return
        }

        setInstalledLocalAcpAgents(nextAgents)
      })
      .catch(() => {
        if (!active) {
          return
        }

        setInstalledLocalAcpAgents([])
      })
      .finally(() => {
        if (active) {
          setIsLoadingInstalledLocalAcpAgents(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (isLoadingAssistants || isLoadingProviders || isLoadingInstalledLocalAcpAgents) {
      return
    }

    if (installedLocalAcpAgents.length === 0) {
      return
    }

    let active = true
    setIsSyncingInstalledLocalAcpTargets(true)

    void (async () => {
      const { assistants: nextAssistants, didMutate, providers: nextProviders } =
        await syncInstalledLocalAcpAgents({
          installedAgents: installedLocalAcpAgents,
          providers: allProviders,
          assistants
        })

      if (didMutate) {
        queryClient.setQueryData(assistantKeys.lists(), nextAssistants)
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: assistantKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
        ])
      }
    })()
      .catch((error) => {
        if (active) {
          toast.error(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setIsSyncingInstalledLocalAcpTargets(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    allProviders,
    assistants,
    installedLocalAcpAgents,
    isLoadingAssistants,
    isLoadingInstalledLocalAcpAgents,
    isLoadingProviders
  ])

  useEffect(() => {
    if (!isAssistantDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (
        event.key === 'Escape' &&
        !createAssistantMutation.isPending &&
        !updateAssistantMutation.isPending &&
        !isAssistantChannelMutating
      ) {
        setIsAssistantDialogOpen(false)
        setAssistantDialogAssistantId(null)
        setAssistantDialogChannelIdOverride(null)
        setAssistantDialogError(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [
    createAssistantMutation.isPending,
    isAssistantChannelMutating,
    isAssistantDialogOpen,
    updateAssistantMutation.isPending
  ])

  useEffect(() => {
    if (!isAssistantDialogOpen || assistantDialogMode !== 'edit') {
      return
    }

    if (!assistantDialogAssistant) {
      setIsAssistantDialogOpen(false)
      setAssistantDialogAssistantId(null)
      setAssistantDialogChannelIdOverride(null)
      setAssistantDialogError(null)
    }
  }, [assistantDialogAssistant, assistantDialogMode, isAssistantDialogOpen])

  useEffect(() => {
    if (isLoadingData) {
      return
    }

    if (visibleAssistants.length === 0) {
      return
    }

    const selectedAssistantId = params.assistantId ?? null
    if (
      selectedAssistantId &&
      visibleAssistants.some((assistant) => assistant.id === selectedAssistantId)
    ) {
      return
    }

    let active = true

    const resolveAssistantRoute = async (): Promise<void> => {
      const assistantsById = new Set(visibleAssistants.map((assistant) => assistant.id))
      const storedSelection = readStoredChatSelection()
      const threadsByAssistant: Array<{
        assistantId: string
        threads: ThreadRecord[]
      }> = []

      const readThreads = async (assistantId: string): Promise<ThreadRecord[]> => {
        const existingCache = threadsByAssistant.find((entry) => entry.assistantId === assistantId)
        if (existingCache) {
          return existingCache.threads
        }

        const loadedThreads = sortThreadsByRecentActivity(await listThreads(assistantId))
        threadsByAssistant.push({
          assistantId,
          threads: loadedThreads
        })
        return loadedThreads
      }

      try {
        if (
          storedSelection &&
          assistantsById.has(storedSelection.assistantId) &&
          storedSelection.threadId
        ) {
          const storedThreads = await readThreads(storedSelection.assistantId)
          const matchedThread = storedThreads.find(
            (thread) => thread.id === storedSelection.threadId
          )
          if (matchedThread) {
            if (!active) {
              return
            }
            navigate(routeToAssistantThreads(storedSelection.assistantId, matchedThread.id), {
              replace: true
            })
            return
          }
        }

        await Promise.all(
          visibleAssistants.map(async (assistant) => {
            await readThreads(assistant.id)
          })
        )
        const latestThread = findLatestThreadAcrossAssistants(threadsByAssistant)
        if (latestThread) {
          if (!active) {
            return
          }
          navigate(routeToAssistantThreads(latestThread.assistantId, latestThread.threadId), {
            replace: true
          })
          return
        }

        const fallbackAssistant = visibleAssistants[0]
        if (fallbackAssistant) {
          if (!active) {
            return
          }
          navigate(routeToAssistantThreads(fallbackAssistant.id), { replace: true })
        }
      } catch (error) {
        if (!active) {
          return
        }
        toast.error(toErrorMessage(error))
        const fallbackAssistant = visibleAssistants[0]
        if (fallbackAssistant) {
          navigate(routeToAssistantThreads(fallbackAssistant.id), { replace: true })
        }
      }
    }

    void resolveAssistantRoute()

    return () => {
      active = false
    }
  }, [isLoadingData, navigate, params.assistantId, visibleAssistants])

  // Use TanStack Query to fetch threads for the selected assistant
  const { data: threadsData = [], isLoading: isLoadingThreads } = useThreads(
    selectedAssistant?.id,
    {
      enabled: !!selectedAssistant
    }
  )

  // Keep threads in local state sorted by recent activity
  useEffect(() => {
    setThreads((currentThreads) =>
      resolveVisibleThreads({
        currentThreads,
        selectedAssistantId: selectedAssistant?.id ?? null,
        threads: threadsData
      })
    )
  }, [selectedAssistant?.id, threadsData])

  useEffect(() => {
    if (!selectedAssistant?.id || !selectedThread?.id) {
      return
    }

    storeChatSelection({
      assistantId: selectedAssistant.id,
      threadId: selectedThread.id
    })
  }, [selectedAssistant?.id, selectedThread?.id])

  useEffect(() => {
    const assistantId = selectedAssistant?.id
    const threadId = selectedThread?.id

    if (!assistantId || !threadId) {
      setIsLoadingChatHistory(false)
      setMessagesRef.current([])
      hasLoadedInitialMessagesRef.current = false
      return
    }

    let active = true
    setIsLoadingChatHistory(true)
    hasLoadedInitialMessagesRef.current = false
    const pendingUserMessage = getDisplayedPendingUserMessage(threadId)
    setMessagesRef.current(pendingUserMessage ? [pendingUserMessage] : [])

    void listThreadChatMessages({
      assistantId,
      threadId,
      profileId
    })
      .then((messages) => {
        if (!active) {
          return
        }
        setMessagesRef.current(mergeHydratedThreadMessages(threadId, messages))
        hasLoadedInitialMessagesRef.current = true
        void resumeStream().catch(() => undefined)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setMessagesRef.current(mergeHydratedThreadMessages(threadId, []))
        hasLoadedInitialMessagesRef.current = true
        void resumeStream().catch(() => undefined)
        toast.error(toErrorMessage(error))
      })
      .finally(() => {
        if (active) {
          setIsLoadingChatHistory(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    getDisplayedPendingUserMessage,
    mergeHydratedThreadMessages,
    profileId,
    resumeStream,
    selectedAssistant?.id,
    selectedThread?.id
  ])

  useEffect(() => {
    const assistantId = selectedAssistant?.id

    if (!assistantId) {
      return
    }

    const streamHandle = openAssistantMessageEventsStream({
      assistantId,
      profileId,
      onEvent: (event) => {
        if (
          event.type !== 'thread-messages-updated' ||
          event.assistantId !== assistantId ||
          event.profileId !== profileId
        ) {
          return
        }

        if (selectedThread?.id === event.threadId) {
          void listThreadChatMessages({
            assistantId,
            threadId: selectedThread.id,
            profileId
          })
            .then((messages) => {
              setMessages(mergeHydratedThreadMessages(selectedThread.id, messages))
            })
            .catch(() => undefined)
        }

        void listThreads(assistantId)
          .then((latestThreads) => {
            setThreads(sortThreadsByRecentActivity(latestThreads))
          })
          .catch(() => undefined)
      }
    })

    return () => {
      streamHandle.close()
    }
  }, [
    mergeHydratedThreadMessages,
    profileId,
    selectedAssistant?.id,
    selectedThread?.id,
    setMessages
  ])

  const createNewThread = useCallback(
    async (options?: { notify?: boolean }): Promise<ThreadRecord | null> => {
      if (!selectedAssistant) {
        return null
      }

      try {
        const createdThread = await createThreadMutation.mutateAsync({
          assistantId: selectedAssistant.id,
          resourceId: getActiveResourceId(),
          title: createThreadTitle()
        })
        setThreads((currentThreads) =>
          sortThreadsByRecentActivity([createdThread, ...currentThreads])
        )
        navigate(routeToAssistantThreads(selectedAssistant.id, createdThread.id))
        if (options?.notify ?? true) {
          toast.success(t('threads.toasts.threadCreated'))
        }
        return createdThread
      } catch (error) {
        toast.error(toErrorMessage(error))
        return null
      }
    },
    [createThreadMutation, navigate, selectedAssistant, t]
  )

  const handleDeleteThread = async (thread: ThreadRecord): Promise<void> => {
    try {
      await deleteThreadMutation.mutateAsync(thread.id)
      setThreads((currentThreads) => currentThreads.filter((item) => item.id !== thread.id))
      if (selectedThread?.id === thread.id) {
        navigate(routeToAssistantThreads(thread.assistantId), { replace: true })
      }
      toast.success(t('threads.toasts.threadRemoved'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const selectWorkspacePath = useCallback(async (): Promise<string | null> => {
    if (typeof window === 'undefined') {
      return null
    }

    const picker = window.tiaDesktop?.pickDirectory
    if (typeof picker !== 'function') {
      return null
    }

    return picker()
  }, [])

  const invalidateClawsCache = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: clawKeys.list() })
  }, [])

  const refreshClawsData = useCallback(async (): Promise<ClawsResponse> => {
    await invalidateClawsCache()

    return queryClient.fetchQuery({
      queryKey: clawKeys.list(),
      queryFn: listClaws
    })
  }, [invalidateClawsCache])

  const refreshChannelAccessPairings = useCallback(async (assistantId: string): Promise<void> => {
    const nextPairings = await listClawPairings(assistantId)
    setChannelAccessPairings(nextPairings.pairings)
  }, [])

  const refreshChannelAccessAuthState = useCallback(
    async (assistantId: string): Promise<void> => {
      const nextAuthState = await getClawChannelAuthState(assistantId)
      setChannelAuthState(nextAuthState)

      if (nextAuthState.status === 'connected') {
        const refreshKey = `${assistantId}:${nextAuthState.updatedAt}`
        if (connectedAuthRefreshKeyRef.current !== refreshKey) {
          connectedAuthRefreshKeyRef.current = refreshKey
          await refreshClawsData()
        }
      }
    },
    [refreshClawsData]
  )

  const openChannelAccessDialog = useCallback(
    async (claw: ClawRecord): Promise<void> => {
      const channelType = claw.channel?.type ?? null
      const shouldLoadPairings = channelType === 'telegram' || channelType === 'whatsapp'
      const shouldLoadAuth = channelType === 'whatsapp' || channelType === 'wechat'

      setChannelAccessClaw(claw)
      setChannelAccessPairings([])
      setChannelAuthState(null)
      setChannelAccessError(null)
      connectedAuthRefreshKeyRef.current = null
      setIsChannelAccessLoading(shouldLoadPairings)
      setIsChannelAuthLoading(shouldLoadAuth)

      try {
        await Promise.all([
          shouldLoadPairings ? refreshChannelAccessPairings(claw.id) : Promise.resolve(),
          shouldLoadAuth ? refreshChannelAccessAuthState(claw.id) : Promise.resolve()
        ])
      } catch (error) {
        setChannelAccessError(
          error instanceof Error ? error.message : t('claws.pairings.errors.loadFailed')
        )
      } finally {
        setIsChannelAccessLoading(false)
        setIsChannelAuthLoading(false)
      }
    },
    [refreshChannelAccessAuthState, refreshChannelAccessPairings, t]
  )

  const handleCreateChannel = useCallback(
    async (input: CreateClawChannelInput): Promise<ConfiguredClawChannelRecord> => {
      setIsAssistantChannelMutating(true)
      setAssistantDialogError(null)

      try {
        const createdChannel = await createClawChannel(input)
        await invalidateClawsCache()
        return createdChannel
      } catch (error) {
        const resolvedError =
          error instanceof Error ? error : new Error(t('claws.errors.saveFailed'))
        setAssistantDialogError(resolvedError.message)
        throw resolvedError
      } finally {
        setIsAssistantChannelMutating(false)
      }
    },
    [invalidateClawsCache, t]
  )

  const handleUpdateChannel = useCallback(
    async (
      channelId: string,
      input: UpdateClawChannelInput
    ): Promise<ConfiguredClawChannelRecord> => {
      setIsAssistantChannelMutating(true)
      setAssistantDialogError(null)

      try {
        const updatedChannel = await updateClawChannel(channelId, input)
        await invalidateClawsCache()
        return updatedChannel
      } catch (error) {
        const resolvedError =
          error instanceof Error ? error : new Error(t('claws.errors.updateFailed'))
        setAssistantDialogError(resolvedError.message)
        throw resolvedError
      } finally {
        setIsAssistantChannelMutating(false)
      }
    },
    [invalidateClawsCache, t]
  )

  const handleDeleteChannel = useCallback(
    async (channelId: string): Promise<void> => {
      setIsAssistantChannelMutating(true)
      setAssistantDialogError(null)

      try {
        await deleteClawChannel(channelId)
        await invalidateClawsCache()
      } catch (error) {
        const resolvedError =
          error instanceof Error ? error : new Error(t('claws.errors.deleteFailed'))
        setAssistantDialogError(resolvedError.message)
        throw resolvedError
      } finally {
        setIsAssistantChannelMutating(false)
      }
    },
    [invalidateClawsCache, t]
  )

  const handleSubmitAssistantDialog = async (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null,
    selectedChannelIdOverride?: string
  ): Promise<void> => {
    setAssistantDialogError(null)

    try {
      const currentChannelId = assistantDialogCurrentClaw?.channel?.id ?? ''
      const nextSelectedChannelId = canManageAssistantChannels
        ? (selectedChannelIdOverride ?? assistantDialogSelectedChannelId).trim()
        : ''
      const nextWorkspacePath =
        typeof input.workspaceConfig?.rootPath === 'string'
          ? input.workspaceConfig.rootPath.trim()
          : ''
      const channelPayload = canManageAssistantChannels
        ? buildChannelPayload(currentChannelId, nextSelectedChannelId)
        : undefined

      if (assistantDialogMode === 'create') {
        const createdAssistant = await createAssistantMutation.mutateAsync(input)
        if (heartbeatInput) {
          await updateAssistantHeartbeat(createdAssistant.id, heartbeatInput)
        }
        let latestClaw: ClawRecord | null = null
        if (nextSelectedChannelId.length > 0 || channelPayload) {
          await updateClaw(createdAssistant.id, {
            assistant: {
              enabled: nextSelectedChannelId.length > 0,
              ...(nextWorkspacePath.length > 0 ? { workspacePath: nextWorkspacePath } : {})
            },
            ...(channelPayload ? { channel: channelPayload } : {})
          })
          const latestClaws = await refreshClawsData()
          latestClaw = latestClaws.claws.find((claw) => claw.id === createdAssistant.id) ?? null
        }
        setThreads([])
        toast.success(t('threads.toasts.assistantCreated'))
        setIsAssistantDialogOpen(false)
        setAssistantDialogAssistantId(null)
        setAssistantDialogChannelIdOverride(null)
        navigate(routeToAssistantThreads(createdAssistant.id))

        if (latestClaw && supportsChannelAccess(latestClaw.channel?.type)) {
          await openChannelAccessDialog(latestClaw)
        }

        return
      }

      if (!assistantDialogAssistant) {
        setAssistantDialogError(t('threads.assistantDialog.notFound'))
        return
      }

      await updateAssistantMutation.mutateAsync({
        id: assistantDialogAssistant.id,
        input
      })
      if (heartbeatInput) {
        await updateAssistantHeartbeat(assistantDialogAssistant.id, heartbeatInput)
      }
      let latestClaw: ClawRecord | null = null
      if (assistantDialogCurrentClaw || nextSelectedChannelId.length > 0 || channelPayload) {
        await updateClaw(assistantDialogAssistant.id, {
          assistant: {
            enabled:
              nextSelectedChannelId.length > 0
                ? (assistantDialogCurrentClaw?.enabled ?? true)
                : false,
            ...(nextWorkspacePath.length > 0 ? { workspacePath: nextWorkspacePath } : {})
          },
          ...(channelPayload ? { channel: channelPayload } : {})
        })
        const latestClaws = await refreshClawsData()
        latestClaw = latestClaws.claws.find((claw) => claw.id === assistantDialogAssistant.id) ?? null
      }
      toast.success(t('threads.toasts.assistantUpdated'))
      setIsAssistantDialogOpen(false)
      setAssistantDialogAssistantId(null)
      setAssistantDialogChannelIdOverride(null)

      if (
        latestClaw &&
        supportsChannelAccess(latestClaw.channel?.type) &&
        (!supportsChannelAccess(assistantDialogCurrentClaw?.channel?.type) ||
          assistantDialogCurrentClaw?.channel?.id !== latestClaw.channel?.id)
      ) {
        await openChannelAccessDialog(latestClaw)
      }
    } catch (error) {
      setAssistantDialogError(toErrorMessage(error))
    }
  }

  const handleChannelAccessAction = useCallback(
    async (
      action: (assistantId: string, pairingId: string) => Promise<unknown>,
      pairingId: string
    ): Promise<void> => {
      if (!channelAccessClaw) {
        return
      }

      setIsChannelAccessSubmitting(true)
      setChannelAccessError(null)

      try {
        await action(channelAccessClaw.id, pairingId)
        await Promise.all([
          refreshChannelAccessPairings(channelAccessClaw.id),
          channelAccessClaw.channel?.type === 'whatsapp'
            ? refreshChannelAccessAuthState(channelAccessClaw.id)
            : Promise.resolve(),
          refreshClawsData()
        ])
      } catch (error) {
        setChannelAccessError(
          error instanceof Error ? error.message : t('claws.pairings.errors.updateFailed')
        )
      } finally {
        setIsChannelAccessSubmitting(false)
      }
    },
    [channelAccessClaw, refreshChannelAccessAuthState, refreshChannelAccessPairings, refreshClawsData, t]
  )

  useEffect(() => {
    if (
      !channelAccessClaw ||
      (channelAccessClaw.channel?.type !== 'whatsapp' &&
        channelAccessClaw.channel?.type !== 'wechat')
    ) {
      return
    }

    if (channelAuthState?.status === 'connected') {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshChannelAccessAuthState(channelAccessClaw.id).catch((error) => {
        setChannelAccessError(
          error instanceof Error ? error.message : t('claws.pairings.errors.loadFailed')
        )
      })
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [channelAccessClaw, channelAuthState?.status, refreshChannelAccessAuthState, t])

  const handleDeleteAssistant = useCallback(
    async (assistantId: string): Promise<void> => {
      if (deleteAssistantMutation.isPending) {
        return
      }

      const assistant = assistants.find((item) => item.id === assistantId)
      if (!assistant) {
        return
      }

      if (assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true) {
        toast.error(t('threads.toasts.builtInDeleteBlocked'))
        return
      }

      const confirmLabel =
        assistant.name.trim().length > 0
          ? assistant.name.trim()
          : t('threads.toasts.assistantDeleteFallbackLabel')
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const confirmed = window.confirm(
          t('threads.toasts.confirmAssistantDelete', { name: confirmLabel })
        )
        if (!confirmed) {
          return
        }
      }

      try {
        await deleteAssistantMutation.mutateAsync(assistantId)
        await invalidateClawsCache()

        setThreads((currentThreads) =>
          currentThreads.filter((thread) => thread.assistantId !== assistantId)
        )

        if (params.assistantId === assistantId) {
          const fallbackAssistant = visibleAssistants.find((a) => a.id !== assistantId)
          if (fallbackAssistant) {
            navigate(routeToAssistantThreads(fallbackAssistant.id), { replace: true })
          } else {
            setMessages([])
            navigate('/chat', { replace: true })
          }
        }

        if (assistantDialogMode === 'edit' && assistantDialogAssistantId === assistantId) {
          setIsAssistantDialogOpen(false)
          setAssistantDialogAssistantId(null)
          setAssistantDialogChannelIdOverride(null)
          setAssistantDialogError(null)
        }

        toast.success(t('threads.toasts.assistantDeleted'))
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [
      assistantDialogAssistantId,
      assistantDialogMode,
      assistants,
      deleteAssistantMutation,
      invalidateClawsCache,
      navigate,
      params.assistantId,
      setMessages,
      t,
      visibleAssistants
    ]
  )

  const handleSubmitMessage = async (messageText: string): Promise<void> => {
    if (!selectedAssistant) {
      return
    }

    const nextMessage = messageText.trim()
    if (nextMessage.length === 0) {
      return
    }

    if (nextMessage.startsWith('/') && selectedThread) {
      try {
        const result = await runThreadCommand({
          assistantId: selectedAssistant.id,
          threadId: selectedThread.id,
          profileId,
          text: nextMessage
        })

        if (result.handled) {
          pendingThreadMessageRef.current = null
          setHasPendingMessage(false)
          return
        }
      } catch (error) {
        toast.error(toErrorMessage(error))
        return
      }
    }

    const queuePendingMessage = (threadId: string, text: string): void => {
      pendingThreadMessageRef.current = {
        threadId,
        message: createPendingUserMessage(threadId, text)
      }
      setHasPendingMessage(true)
    }

    if (selectedThread) {
      if (!chatTransport || isLoadingChatHistory || !hasLoadedInitialMessagesRef.current) {
        queuePendingMessage(selectedThread.id, nextMessage)
        return
      }

      try {
        const pendingUserMessage = createPendingUserMessage(selectedThread.id, nextMessage)
        activePendingUserMessagesRef.current.set(selectedThread.id, pendingUserMessage)
        await sendMessage(pendingUserMessage)
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
      return
    }

    const createdThread = await createNewThread({ notify: false })
    if (!createdThread) {
      return
    }

    queuePendingMessage(createdThread.id, nextMessage)
  }

  const handleAbortGeneration = useCallback(() => {
    if (!isChatStreaming) {
      return
    }

    if (selectedAssistant && selectedThread) {
      void runThreadCommand({
        assistantId: selectedAssistant.id,
        threadId: selectedThread.id,
        profileId,
        text: '/stop'
      }).catch((error) => {
        toast.error(toErrorMessage(error))
      })
      return
    }

    void stop()
  }, [isChatStreaming, profileId, selectedAssistant, selectedThread, stop])

  useEffect(() => {
    if (!hasPendingMessage) {
      return
    }

    const pendingMessage = pendingThreadMessageRef.current
    if (!pendingMessage) {
      return
    }

    if (!selectedThread || selectedThread.id !== pendingMessage.threadId) {
      return
    }

    if (isLoadingChatHistory || isChatStreaming) {
      return
    }

    // Ensure chat transport is ready
    if (!chatTransport) {
      return
    }

    // Ensure initial messages have been loaded
    if (!hasLoadedInitialMessagesRef.current) {
      return
    }

    // Clear pending message state immediately to prevent duplicate sends
    const messageToSend = pendingMessage.message
    pendingThreadMessageRef.current = null
    setHasPendingMessage(false)
    activePendingUserMessagesRef.current.set(pendingMessage.threadId, messageToSend)

    void sendQueuedPendingUserMessage(messageToSend).catch((error) => {
      toast.error(toErrorMessage(error))
    })
  }, [
    hasPendingMessage,
    isLoadingChatHistory,
    isChatStreaming,
    selectedThread,
    chatTransport,
    sendQueuedPendingUserMessage
  ])

  const closeAssistantDialog = useCallback(() => {
    if (
      createAssistantMutation.isPending ||
      updateAssistantMutation.isPending ||
      isAssistantChannelMutating
    ) {
      return
    }

    setIsAssistantDialogOpen(false)
    setAssistantDialogAssistantId(null)
    setAssistantDialogChannelIdOverride(null)
    setAssistantDialogError(null)
  }, [
    createAssistantMutation.isPending,
    isAssistantChannelMutating,
    updateAssistantMutation.isPending
  ])

  const openAssistantChannelSetup = useCallback(async (): Promise<void> => {
    if (!assistantDialogCurrentClaw || !supportsChannelAccess(assistantDialogCurrentClaw.channel?.type)) {
      return
    }

    closeAssistantDialog()
    await openChannelAccessDialog(assistantDialogCurrentClaw)
  }, [assistantDialogCurrentClaw, closeAssistantDialog, openChannelAccessDialog])

  const openCreateAssistantDialog = useCallback(() => {
    setAssistantDialogMode('create')
    setAssistantDialogAssistantId(null)
    setAssistantDialogChannelIdOverride('')
    setAssistantDialogError(null)
    setIsAssistantDialogOpen(true)
  }, [])

  const openEditAssistantDialog = useCallback((assistantId: string) => {
    setAssistantDialogMode('edit')
    setAssistantDialogAssistantId(assistantId)
    setAssistantDialogChannelIdOverride(null)
    setAssistantDialogError(null)
    setIsAssistantDialogOpen(true)
  }, [])

  const openAssistantConfigDialog = useCallback(() => {
    if (!selectedAssistant) {
      return
    }

    openEditAssistantDialog(selectedAssistant.id)
  }, [openEditAssistantDialog, selectedAssistant])

  const handleSelectAssistant = useCallback(
    (assistantId: string) => {
      navigate(routeToAssistantThreads(assistantId))
    },
    [navigate]
  )

  const handleSelectThread = useCallback(
    (assistantId: string, threadId: string) => {
      navigate(routeToAssistantThreads(assistantId, threadId))
    },
    [navigate]
  )

  const openHeartbeatMonitor = useCallback(() => {
    if (!selectedAssistant) {
      return
    }

    setHeartbeatMonitorAssistant(selectedAssistant)
  }, [selectedAssistant])

  const openCronMonitor = useCallback(() => {
    if (!selectedAssistant) {
      return
    }

    setCronMonitorAssistant(selectedAssistant)
  }, [selectedAssistant])

  const assistantDialogChannels =
    canManageAssistantChannels && !isLoadingClaws
      ? {
          currentAssistantId:
            assistantDialogMode === 'edit' ? (assistantDialogAssistant?.id ?? null) : null,
          channels: clawsData.configuredChannels,
          selectedChannelId: assistantDialogSelectedChannelId,
          isMutating: isAssistantChannelMutating,
          errorMessage: assistantDialogError,
          onSelectedChannelChange: setAssistantDialogChannelIdOverride,
          onCreateChannel: handleCreateChannel,
          onUpdateChannel: handleUpdateChannel,
          onDeleteChannel: handleDeleteChannel
        }
      : undefined

  const assistantDialogChannelSetupAction =
    assistantDialogCurrentClaw && supportsChannelAccess(assistantDialogCurrentClaw.channel?.type)
      ? {
          label:
            assistantDialogCurrentClaw.channel?.type === 'wechat'
              ? t('claws.wechat.manageSetupButton')
              : t('claws.telegram.managePairingsButton'),
          onOpen: openAssistantChannelSetup
        }
      : null

  return {
    assistantsCount: visibleAssistants.length,
    assistantOptions: visibleAssistants.map((assistant) => ({
      id: assistant.id,
      name: assistant.name,
      description: assistant.description,
      origin: assistant.origin ?? 'tia'
    })),
    sidebarBranches,
    selectedAssistant,
    selectedThread,
    readiness,
    supportsVision,
    chat,
    isLoadingData,
    isLoadingThreads,
    isCreatingThread: createThreadMutation.isPending,
    deletingThreadId: deleteThreadMutation.isPending ? deleteThreadMutation.variables : null,
    deletingAssistantId: deleteAssistantMutation.isPending
      ? deleteAssistantMutation.variables
      : null,
    isLoadingChatHistory,
    isChatStreaming,
    chatError,
    loadError,
    canAbortGeneration,
    providers,
    mcpServers,
    assistantDialogMode,
    assistantDialogAssistant,
    assistantDialogChannels,
    assistantDialogChannelSetupAction,
    isAssistantDialogOpen,
    isSubmittingAssistantDialog:
      createAssistantMutation.isPending ||
      updateAssistantMutation.isPending ||
      isAssistantChannelMutating,
    assistantDialogError,
    channelAccessClaw,
    channelAccessPairings,
    isChannelAccessLoading,
    channelAuthState,
    isChannelAuthLoading,
    isChannelAccessSubmitting,
    channelAccessError,
    tokenUsage,
    heartbeatMonitorAssistant,
    cronMonitorAssistant,
    onCreateThread: () => {
      void createNewThread()
    },
    onCreateAssistant: openCreateAssistantDialog,
    onBrowseAssistants: () => {
      navigate('/chat')
    },
    onSelectAssistant: handleSelectAssistant,
    onSelectThread: handleSelectThread,
    onEditAssistant: openEditAssistantDialog,
    onDeleteAssistant: (assistantId: string) => {
      void handleDeleteAssistant(assistantId)
    },
    onDeleteThread: (thread: ThreadRecord) => {
      void handleDeleteThread(thread)
    },
    onSubmitMessage: handleSubmitMessage,
    onAbortGeneration: handleAbortGeneration,
    onOpenAssistantConfig: openAssistantConfigDialog,
    onOpenHeartbeatMonitor: openHeartbeatMonitor,
    onCloseHeartbeatMonitor: () => {
      setHeartbeatMonitorAssistant(null)
    },
    onOpenCronMonitor: openCronMonitor,
    onCloseCronMonitor: () => {
      setCronMonitorAssistant(null)
    },
    onCloseAssistantDialog: closeAssistantDialog,
    onCloseChannelAccessDialog: () => {
      if (isChannelAccessSubmitting) {
        return
      }

      setChannelAccessClaw(null)
      setChannelAccessPairings([])
      setIsChannelAccessLoading(false)
      setChannelAuthState(null)
      setIsChannelAuthLoading(false)
      setChannelAccessError(null)
    },
    onApproveChannelAccessPairing: (pairingId: string) => {
      void handleChannelAccessAction(approveClawPairing, pairingId)
    },
    onRejectChannelAccessPairing: (pairingId: string) => {
      void handleChannelAccessAction(rejectClawPairing, pairingId)
    },
    onRevokeChannelAccessPairing: (pairingId: string) => {
      void handleChannelAccessAction(revokeClawPairing, pairingId)
    },
    onSelectWorkspacePath: selectWorkspacePath,
    onSubmitAssistantDialog: handleSubmitAssistantDialog
  }
}

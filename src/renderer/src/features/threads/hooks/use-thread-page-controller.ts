import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  useAssistants,
  useCreateAssistant,
  useUpdateAssistant,
  useDeleteAssistant,
  type SaveAssistantInput
} from '../../assistants/assistants-query'
import {
  updateAssistantHeartbeat,
  type SaveAssistantHeartbeatInput
} from '../../assistants/assistant-heartbeat-query'
import type { AssistantDialogMode } from '../components/assistant-config-dialog'
import {
  getMcpServersSettings,
  type McpServerRecord
} from '../../settings/mcp-servers/mcp-servers-query'
import { useProviders } from '../../settings/providers/providers-query'
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

type PendingThreadMessage = {
  threadId: string
  message: UIMessage
}

const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'

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
  const createAssistantMutation = useCreateAssistant()
  const updateAssistantMutation = useUpdateAssistant()
  const deleteAssistantMutation = useDeleteAssistant()
  const createThreadMutation = useCreateThread()
  const deleteThreadMutation = useDeleteThread()

  // Filter to only show enabled providers
  const providers = useMemo(
    () => allProviders.filter((provider) => provider.enabled),
    [allProviders]
  )

  // Local state for MCP servers (not yet migrated to TanStack Query)
  const [mcpServers, setMcpServers] = useState<Record<string, McpServerRecord>>({})

  // Local state for threads (will be replaced by useThreads hook)
  const [threads, setThreads] = useState<ThreadRecord[]>([])

  // Derived loading states
  const isLoadingData = isLoadingAssistants || isLoadingProviders
  const loadError = assistantsError
    ? toErrorMessage(assistantsError)
    : providersError
      ? toErrorMessage(providersError)
      : null

  // UI state
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false)
  const [assistantDialogMode, setAssistantDialogMode] = useState<AssistantDialogMode>('edit')
  const [assistantDialogAssistantId, setAssistantDialogAssistantId] = useState<string | null>(null)
  const [isAssistantDialogOpen, setIsAssistantDialogOpen] = useState(false)
  const [assistantDialogError, setAssistantDialogError] = useState<string | null>(null)
  const pendingThreadMessageRef = useRef<PendingThreadMessage | null>(null)
  const activePendingUserMessagesRef = useRef(new Map<string, UIMessage>())
  const [hasPendingMessage, setHasPendingMessage] = useState(false)
  const hasLoadedInitialMessagesRef = useRef(false)
  const profileId = useMemo(() => getActiveResourceId(), [])

  const selectedAssistant = useMemo(() => {
    const assistantId = params.assistantId
    if (!assistantId) {
      return null
    }

    return assistants.find((assistant) => assistant.id === assistantId) ?? null
  }, [assistants, params.assistantId])

  const assistantDialogAssistant = useMemo(() => {
    if (assistantDialogMode !== 'edit') {
      return null
    }

    if (assistantDialogAssistantId) {
      return assistants.find((assistant) => assistant.id === assistantDialogAssistantId) ?? null
    }

    return selectedAssistant
  }, [assistantDialogAssistantId, assistantDialogMode, assistants, selectedAssistant])

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
      assistants,
      selectedAssistantId: selectedAssistant?.id ?? null,
      threads
    })
  }, [assistants, selectedAssistant?.id, threads])

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
    resume: Boolean(selectedThread && chatTransport),
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
    status: chatStatus,
    error: chatError,
    messages: chatMessages
  } = chat
  const setMessagesRef = useRef(setMessages)
  const stopChatRef = useRef(stop)
  const isChatStreamingRef = useRef(false)
  const currentChatMessagesRef = useRef<readonly UIMessage[]>(chatMessages)

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
    stopChatRef.current = stop
    isChatStreamingRef.current = isChatStreaming
    currentChatMessagesRef.current = chatMessages
  }, [chatMessages, isChatStreaming, setMessages, stop])

  // Stop any ongoing chat operations when assistant or thread changes
  useEffect(() => {
    return () => {
      if (isChatStreamingRef.current) {
        stopChatRef.current()
      }
    }
  }, [selectedAssistant?.id, selectedThread?.id])

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
    if (!isAssistantDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (
        event.key === 'Escape' &&
        !createAssistantMutation.isPending &&
        !updateAssistantMutation.isPending
      ) {
        setIsAssistantDialogOpen(false)
        setAssistantDialogError(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isAssistantDialogOpen, createAssistantMutation.isPending, updateAssistantMutation.isPending])

  useEffect(() => {
    if (!isAssistantDialogOpen || assistantDialogMode !== 'edit') {
      return
    }

    if (!assistantDialogAssistant) {
      setIsAssistantDialogOpen(false)
      setAssistantDialogAssistantId(null)
      setAssistantDialogError(null)
    }
  }, [assistantDialogAssistant, assistantDialogMode, isAssistantDialogOpen])

  useEffect(() => {
    if (isLoadingData) {
      return
    }

    if (assistants.length === 0) {
      return
    }

    const selectedAssistantId = params.assistantId ?? null
    if (!selectedAssistantId) {
      return
    }

    if (assistants.some((assistant) => assistant.id === selectedAssistantId)) {
      return
    }

    let active = true

    const resolveAssistantRoute = async (): Promise<void> => {
      const assistantsById = new Set(assistants.map((assistant) => assistant.id))
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
          assistants.map(async (assistant) => {
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

        const fallbackAssistant = assistants[0]
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
        navigate(routeToAssistantThreads(assistants[0].id), { replace: true })
      }
    }

    void resolveAssistantRoute()

    return () => {
      active = false
    }
  }, [assistants, isLoadingData, navigate, params.assistantId])

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
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setMessagesRef.current(mergeHydratedThreadMessages(threadId, []))
        hasLoadedInitialMessagesRef.current = true
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

  const handleSubmitAssistantDialog = async (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null
  ): Promise<void> => {
    setAssistantDialogError(null)

    try {
      if (assistantDialogMode === 'create') {
        const createdAssistant = await createAssistantMutation.mutateAsync(input)
        setThreads([])
        toast.success(t('threads.toasts.assistantCreated'))
        setIsAssistantDialogOpen(false)
        setAssistantDialogAssistantId(null)
        navigate(routeToAssistantThreads(createdAssistant.id))
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
      toast.success(t('threads.toasts.assistantUpdated'))
      setIsAssistantDialogOpen(false)
      setAssistantDialogAssistantId(null)
    } catch (error) {
      setAssistantDialogError(toErrorMessage(error))
    }
  }

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

        setThreads((currentThreads) =>
          currentThreads.filter((thread) => thread.assistantId !== assistantId)
        )

        if (params.assistantId === assistantId) {
          const fallbackAssistant = assistants.find((a) => a.id !== assistantId)
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
      navigate,
      params.assistantId,
      setMessages,
      t
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

    void stop()
  }, [isChatStreaming, stop])

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

    void sendMessage(messageToSend).catch((error) => {
      toast.error(toErrorMessage(error))
    })
  }, [
    hasPendingMessage,
    isLoadingChatHistory,
    isChatStreaming,
    selectedThread,
    chatTransport,
    sendMessage
  ])

  const closeAssistantDialog = useCallback(() => {
    if (createAssistantMutation.isPending || updateAssistantMutation.isPending) {
      return
    }

    setIsAssistantDialogOpen(false)
    setAssistantDialogAssistantId(null)
    setAssistantDialogError(null)
  }, [createAssistantMutation.isPending, updateAssistantMutation.isPending])

  const openCreateAssistantDialog = useCallback(() => {
    setAssistantDialogMode('create')
    setAssistantDialogAssistantId(null)
    setAssistantDialogError(null)
    setIsAssistantDialogOpen(true)
  }, [])

  const openEditAssistantDialog = useCallback((assistantId: string) => {
    setAssistantDialogMode('edit')
    setAssistantDialogAssistantId(assistantId)
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

  return {
    assistantsCount: assistants.length,
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
    isAssistantDialogOpen,
    isSubmittingAssistantDialog:
      createAssistantMutation.isPending || updateAssistantMutation.isPending,
    assistantDialogError,
    tokenUsage,
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
    onCloseAssistantDialog: closeAssistantDialog,
    onSelectWorkspacePath: selectWorkspacePath,
    onSubmitAssistantDialog: handleSubmitAssistantDialog
  }
}

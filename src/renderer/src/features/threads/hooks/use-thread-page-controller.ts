import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  createAssistant,
  deleteAssistant,
  listAssistants,
  updateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../../assistants/assistants-query'
import type { AssistantDialogMode } from '../components/assistant-config-dialog'
import {
  getMcpServersSettings,
  type McpServerRecord
} from '../../settings/mcp-servers/mcp-servers-query'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'
import {
  createThread,
  deleteThread,
  getActiveResourceId,
  listThreads,
  type ThreadRecord
} from '../threads-query'
import { createThreadChatTransport, listThreadChatMessages } from '../chat-query'
import { buildAssistantThreadBranches, evaluateAssistantReadiness } from '../thread-page-helpers'
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
  text: string
}

const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'

export type ThreadPageController = ReturnType<typeof useThreadPageController>

export function useThreadPageController() {
  const params = useParams()
  const navigate = useNavigate()
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [mcpServers, setMcpServers] = useState<Record<string, McpServerRecord>>({})
  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false)
  const [assistantDialogMode, setAssistantDialogMode] = useState<AssistantDialogMode>('edit')
  const [assistantDialogAssistantId, setAssistantDialogAssistantId] = useState<string | null>(null)
  const [isAssistantDialogOpen, setIsAssistantDialogOpen] = useState(false)
  const [isSubmittingAssistantDialog, setIsSubmittingAssistantDialog] = useState(false)
  const [assistantDialogError, setAssistantDialogError] = useState<string | null>(null)
  const [deletingAssistantId, setDeletingAssistantId] = useState<string | null>(null)
  const pendingThreadMessageRef = useRef<PendingThreadMessage | null>(null)
  const [hasPendingMessage, setHasPendingMessage] = useState(false)
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number
    outputTokens: number
    totalTokens: number
  } | null>(null)
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
    onFinish: ({ message }) => {
      const selectedAssistantId = selectedAssistant?.id
      if (!selectedThread || !selectedAssistantId) {
        return
      }

      // Extract usage from message metadata
      if (message.metadata && typeof message.metadata === 'object' && 'usage' in message.metadata) {
        const usage = message.metadata.usage as {
          inputTokens: number
          outputTokens: number
          totalTokens: number
        }
        setTokenUsage(usage)
      }

      const now = new Date().toISOString()
      setThreads((currentThreads) => {
        const nextThreads = currentThreads.map((thread) =>
          thread.id === selectedThread.id
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

  const { sendMessage, setMessages, stop, status: chatStatus, error: chatError } = chat

  const isChatStreaming = chatStatus === 'submitted' || chatStatus === 'streaming'
  const canAbortGeneration = isChatStreaming

  // Stop any ongoing chat operations when assistant or thread changes
  useEffect(() => {
    return () => {
      if (isChatStreaming) {
        stop()
      }
    }
  }, [selectedAssistant?.id, selectedThread?.id])

  const loadAssistantsAndProviders = useCallback(async () => {
    setIsLoadingData(true)
    setLoadError(null)
    try {
      const [assistantsResult, providersResult, mcpSettingsResult] = await Promise.allSettled([
        listAssistants(),
        listProviders(),
        getMcpServersSettings()
      ])

      if (assistantsResult.status === 'rejected') {
        throw assistantsResult.reason
      }

      if (providersResult.status === 'rejected') {
        throw providersResult.reason
      }

      setAssistants(assistantsResult.value)
      setProviders(providersResult.value)

      if (mcpSettingsResult.status === 'fulfilled') {
        setMcpServers(mcpSettingsResult.value.mcpServers)
      } else {
        setMcpServers({})
      }
    } catch (error) {
      setLoadError(toErrorMessage(error))
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    void loadAssistantsAndProviders()
  }, [loadAssistantsAndProviders])

  useEffect(() => {
    if (!isAssistantDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSubmittingAssistantDialog) {
        setIsAssistantDialogOpen(false)
        setAssistantDialogError(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isAssistantDialogOpen, isSubmittingAssistantDialog])

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
    if (
      selectedAssistantId &&
      assistants.some((assistant) => assistant.id === selectedAssistantId)
    ) {
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
        setLoadError(toErrorMessage(error))
        navigate(routeToAssistantThreads(assistants[0].id), { replace: true })
      }
    }

    void resolveAssistantRoute()

    return () => {
      active = false
    }
  }, [assistants, isLoadingData, navigate, params.assistantId])

  useEffect(() => {
    if (!selectedAssistant) {
      setThreads([])
      return
    }

    let active = true
    setIsLoadingThreads(true)
    setLoadError(null)

    void listThreads(selectedAssistant.id)
      .then((nextThreads) => {
        if (active) {
          setThreads(sortThreadsByRecentActivity(nextThreads))
        }
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
  }, [selectedAssistant])

  useEffect(() => {
    setTokenUsage(null)
  }, [selectedAssistant?.id, selectedThread?.id])

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
      setMessages([])
      return
    }

    let active = true
    setIsLoadingChatHistory(true)

    void listThreadChatMessages({
      assistantId,
      threadId,
      profileId
    })
      .then((messages) => {
        if (!active) {
          return
        }
        setMessages(messages)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setMessages([])
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
  }, [profileId, selectedAssistant?.id, selectedThread?.id, setMessages])

  const createNewThread = useCallback(
    async (options?: { notify?: boolean }): Promise<ThreadRecord | null> => {
      if (!selectedAssistant) {
        return null
      }

      setIsCreatingThread(true)
      try {
        const createdThread = await createThread({
          assistantId: selectedAssistant.id,
          resourceId: getActiveResourceId(),
          title: createThreadTitle()
        })
        setThreads((currentThreads) =>
          sortThreadsByRecentActivity([createdThread, ...currentThreads])
        )
        navigate(routeToAssistantThreads(selectedAssistant.id, createdThread.id))
        if (options?.notify ?? true) {
          toast.success('Thread created.')
        }
        return createdThread
      } catch (error) {
        toast.error(toErrorMessage(error))
        return null
      } finally {
        setIsCreatingThread(false)
      }
    },
    [navigate, selectedAssistant]
  )

  const handleDeleteThread = async (thread: ThreadRecord): Promise<void> => {
    setDeletingThreadId(thread.id)

    try {
      await deleteThread(thread.id)
      setThreads((currentThreads) => currentThreads.filter((item) => item.id !== thread.id))
      if (selectedThread?.id === thread.id) {
        navigate(routeToAssistantThreads(thread.assistantId), { replace: true })
      }
      toast.success('Thread removed.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setDeletingThreadId(null)
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

  const handleSubmitAssistantDialog = async (input: SaveAssistantInput): Promise<void> => {
    setIsSubmittingAssistantDialog(true)
    setAssistantDialogError(null)

    try {
      if (assistantDialogMode === 'create') {
        const createdAssistant = await createAssistant(input)
        setAssistants((currentAssistants) => [createdAssistant, ...currentAssistants])
        setThreads([])
        toast.success('Assistant created.')
        setIsAssistantDialogOpen(false)
        setAssistantDialogAssistantId(null)
        navigate(routeToAssistantThreads(createdAssistant.id))
        return
      }

      if (!assistantDialogAssistant) {
        setAssistantDialogError('Assistant not found.')
        return
      }

      const updatedAssistant = await updateAssistant(assistantDialogAssistant.id, input)
      setAssistants((currentAssistants) =>
        currentAssistants.map((assistant) =>
          assistant.id === updatedAssistant.id ? updatedAssistant : assistant
        )
      )
      toast.success('Assistant configuration updated.')
      setIsAssistantDialogOpen(false)
      setAssistantDialogAssistantId(null)
    } catch (error) {
      setAssistantDialogError(toErrorMessage(error))
    } finally {
      setIsSubmittingAssistantDialog(false)
    }
  }

  const handleDeleteAssistant = useCallback(
    async (assistantId: string): Promise<void> => {
      if (deletingAssistantId) {
        return
      }

      const assistant = assistants.find((item) => item.id === assistantId)
      if (!assistant) {
        return
      }

      if (assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true) {
        toast.error('Built-in default assistant cannot be deleted.')
        return
      }

      const confirmLabel =
        assistant.name.trim().length > 0 ? assistant.name.trim() : 'this assistant'
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const confirmed = window.confirm(
          `Delete "${confirmLabel}"? This will also delete all of its threads.`
        )
        if (!confirmed) {
          return
        }
      }

      setDeletingAssistantId(assistantId)

      try {
        await deleteAssistant(assistantId)

        let fallbackAssistantId: string | null = null
        setAssistants((currentAssistants) => {
          const nextAssistants = currentAssistants.filter(
            (assistant) => assistant.id !== assistantId
          )
          fallbackAssistantId = nextAssistants.at(0)?.id ?? null
          return nextAssistants
        })

        setThreads((currentThreads) =>
          currentThreads.filter((thread) => thread.assistantId !== assistantId)
        )

        if (params.assistantId === assistantId) {
          if (fallbackAssistantId) {
            navigate(routeToAssistantThreads(fallbackAssistantId), { replace: true })
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

        toast.success('Assistant deleted.')
      } catch (error) {
        toast.error(toErrorMessage(error))
      } finally {
        setDeletingAssistantId(null)
      }
    },
    [
      assistantDialogAssistantId,
      assistantDialogMode,
      assistants,
      deletingAssistantId,
      navigate,
      params.assistantId,
      setMessages
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

    if (selectedThread) {
      try {
        await sendMessage({
          text: nextMessage
        })
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
      return
    }

    const createdThread = await createNewThread({ notify: false })
    if (!createdThread) {
      return
    }

    pendingThreadMessageRef.current = {
      threadId: createdThread.id,
      text: nextMessage
    }
    setHasPendingMessage(true)
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

    const messageToSend = pendingMessage.text
    pendingThreadMessageRef.current = null
    setHasPendingMessage(false)

    void sendMessage({
      text: messageToSend
    }).catch((error) => {
      toast.error(toErrorMessage(error))
    })
  }, [
    hasPendingMessage,
    isLoadingChatHistory,
    isChatStreaming,
    selectedThread,
    sendMessage
  ])

  const closeAssistantDialog = useCallback(() => {
    if (isSubmittingAssistantDialog) {
      return
    }

    setIsAssistantDialogOpen(false)
    setAssistantDialogAssistantId(null)
    setAssistantDialogError(null)
  }, [isSubmittingAssistantDialog])

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
    isCreatingThread,
    deletingThreadId,
    deletingAssistantId,
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
    isSubmittingAssistantDialog,
    assistantDialogError,
    tokenUsage,
    onCreateThread: () => {
      void createNewThread()
    },
    onCreateAssistant: openCreateAssistantDialog,
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

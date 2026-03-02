import { useCallback, useEffect, useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listAssistants,
  updateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../../assistants/assistants-query'
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

type ToastState = {
  kind: 'success' | 'error'
  message: string
}

type PendingThreadMessage = {
  threadId: string
  text: string
}

export type ThreadPageController = ReturnType<typeof useThreadPageController>

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useThreadPageController() {
  const params = useParams()
  const navigate = useNavigate()
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [composerValue, setComposerValue] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false)
  const [isAssistantConfigDialogOpen, setIsAssistantConfigDialogOpen] = useState(false)
  const [isSavingAssistantConfig, setIsSavingAssistantConfig] = useState(false)
  const [pendingThreadMessage, setPendingThreadMessage] = useState<PendingThreadMessage | null>(
    null
  )
  const [isSubmittingPendingMessage, setIsSubmittingPendingMessage] = useState(false)
  const profileId = useMemo(() => getActiveResourceId(), [])

  const selectedAssistant = useMemo(() => {
    const assistantId = params.assistantId
    if (!assistantId) {
      return null
    }

    return assistants.find((assistant) => assistant.id === assistantId) ?? null
  }, [assistants, params.assistantId])

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
    onFinish: () => {
      if (!selectedThread) {
        return
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
    }
  })

  const { sendMessage, setMessages, status: chatStatus, error: chatError } = chat

  const isChatStreaming = chatStatus === 'submitted' || chatStatus === 'streaming'
  const canSendMessage =
    Boolean(selectedAssistant && readiness.canChat) &&
    composerValue.trim().length > 0 &&
    !isChatStreaming &&
    !isLoadingChatHistory &&
    !isCreatingThread &&
    !isSubmittingPendingMessage

  const showToast = useCallback((kind: ToastState['kind'], message: string): void => {
    setToast({ kind, message })
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeout = window.setTimeout(() => {
      setToast(null)
    }, 3200)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [toast])

  const loadAssistantsAndProviders = useCallback(async () => {
    setIsLoadingData(true)
    setLoadError(null)
    try {
      const [nextAssistants, nextProviders] = await Promise.all([listAssistants(), listProviders()])
      setAssistants(nextAssistants)
      setProviders(nextProviders)
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
    if (!isAssistantConfigDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSavingAssistantConfig) {
        setIsAssistantConfigDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isAssistantConfigDialogOpen, isSavingAssistantConfig])

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
    setComposerValue('')
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
    setMessages([])

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
        showToast('error', toErrorMessage(error))
      })
      .finally(() => {
        if (active) {
          setIsLoadingChatHistory(false)
        }
      })

    return () => {
      active = false
    }
  }, [profileId, selectedAssistant?.id, selectedThread?.id, setMessages, showToast])

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
          title: createThreadTitle(threads)
        })
        setThreads((currentThreads) =>
          sortThreadsByRecentActivity([createdThread, ...currentThreads])
        )
        navigate(routeToAssistantThreads(selectedAssistant.id, createdThread.id))
        if (options?.notify ?? true) {
          showToast('success', 'Thread created.')
        }
        return createdThread
      } catch (error) {
        showToast('error', toErrorMessage(error))
        return null
      } finally {
        setIsCreatingThread(false)
      }
    },
    [navigate, selectedAssistant, showToast, threads]
  )

  const handleDeleteThread = async (thread: ThreadRecord): Promise<void> => {
    setDeletingThreadId(thread.id)

    try {
      await deleteThread(thread.id)
      setThreads((currentThreads) => currentThreads.filter((item) => item.id !== thread.id))
      if (selectedThread?.id === thread.id) {
        navigate(routeToAssistantThreads(thread.assistantId), { replace: true })
      }
      showToast('success', 'Thread removed.')
    } catch (error) {
      showToast('error', toErrorMessage(error))
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

  const handleUpdateAssistantConfig = async (input: SaveAssistantInput): Promise<void> => {
    if (!selectedAssistant) {
      return
    }

    setIsSavingAssistantConfig(true)

    try {
      const updatedAssistant = await updateAssistant(selectedAssistant.id, input)
      setAssistants((currentAssistants) =>
        currentAssistants.map((assistant) =>
          assistant.id === updatedAssistant.id ? updatedAssistant : assistant
        )
      )
      showToast('success', 'Assistant configuration updated.')
      setIsAssistantConfigDialogOpen(false)
    } catch (error) {
      showToast('error', toErrorMessage(error))
    } finally {
      setIsSavingAssistantConfig(false)
    }
  }

  const handleSubmitMessage = async (): Promise<void> => {
    if (!canSendMessage || !selectedAssistant) {
      return
    }

    const nextMessage = composerValue.trim()
    setComposerValue('')

    if (selectedThread) {
      try {
        await sendMessage({
          text: nextMessage
        })
      } catch (error) {
        setComposerValue(nextMessage)
        showToast('error', toErrorMessage(error))
      }
      return
    }

    const createdThread = await createNewThread({ notify: false })
    if (!createdThread) {
      setComposerValue(nextMessage)
      return
    }

    setPendingThreadMessage({
      threadId: createdThread.id,
      text: nextMessage
    })
  }

  useEffect(() => {
    if (!pendingThreadMessage) {
      return
    }

    if (!selectedThread || selectedThread.id !== pendingThreadMessage.threadId) {
      return
    }

    if (isLoadingChatHistory || isSubmittingPendingMessage) {
      return
    }

    let active = true
    setIsSubmittingPendingMessage(true)

    void sendMessage({
      text: pendingThreadMessage.text
    })
      .then(() => {
        if (active) {
          setPendingThreadMessage(null)
        }
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setComposerValue(pendingThreadMessage.text)
        showToast('error', toErrorMessage(error))
        setPendingThreadMessage(null)
      })
      .finally(() => {
        if (active) {
          setIsSubmittingPendingMessage(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    isLoadingChatHistory,
    isSubmittingPendingMessage,
    pendingThreadMessage,
    selectedThread,
    sendMessage,
    showToast
  ])

  const closeAssistantConfigDialog = useCallback(() => {
    if (!isSavingAssistantConfig) {
      setIsAssistantConfigDialogOpen(false)
    }
  }, [isSavingAssistantConfig])

  const openAssistantConfigDialog = useCallback(() => {
    setIsAssistantConfigDialogOpen(true)
  }, [])

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
    chat,
    isLoadingData,
    isLoadingThreads,
    isCreatingThread,
    deletingThreadId,
    isLoadingChatHistory,
    isChatStreaming: isChatStreaming || isSubmittingPendingMessage,
    chatError,
    loadError,
    composerValue,
    canSendMessage,
    providers,
    toast,
    isAssistantConfigDialogOpen,
    isSavingAssistantConfig,
    onCreateThread: () => {
      void createNewThread()
    },
    onSelectAssistant: handleSelectAssistant,
    onSelectThread: handleSelectThread,
    onDeleteThread: (thread: ThreadRecord) => {
      void handleDeleteThread(thread)
    },
    onComposerChange: setComposerValue,
    onSubmitMessage: handleSubmitMessage,
    onOpenAssistantConfig: openAssistantConfigDialog,
    onCloseAssistantConfig: closeAssistantConfigDialog,
    onSelectWorkspacePath: selectWorkspacePath,
    onUpdateAssistantConfig: handleUpdateAssistantConfig
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from '../../../i18n/use-app-translation'
import { useAssistants } from '../../assistants/assistants-query'
import { useProviders } from '../../settings/providers/providers-query'
import {
  useDeleteWorkspace,
  useRelocateWorkspace,
  useWorkspaces
} from '../../workspaces/workspaces-query'
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
  buildWorkspaceThreadBranches,
  evaluateAssistantReadiness,
  resolveWorkspaceAssistant,
  resolveVisibleThreads
} from '../thread-page-helpers'
import {
  createThreadTitle,
  findLatestThread,
  readStoredThreadSelection,
  routeToNewThread,
  routeToThread,
  sortThreadsByRecentActivity,
  storeThreadSelection,
  type ThreadRouteScope,
  toErrorMessage
} from '../thread-page-routing'

type PendingThreadMessage = {
  threadId: string
  message: UIMessage
}

type ThreadProviderOverride = {
  providerId: string
  model: string
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

function readThreadProviderOverride(
  metadata: Record<string, unknown> | undefined
): ThreadProviderOverride | null {
  const override = metadata?.providerOverride
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return null
  }

  const overrideRecord = override as Record<string, unknown>

  const providerId =
    typeof overrideRecord.providerId === 'string' ? overrideRecord.providerId.trim() : ''
  const model = typeof overrideRecord.model === 'string' ? overrideRecord.model.trim() : ''
  if (providerId.length === 0 || model.length === 0) {
    return null
  }

  return {
    providerId,
    model
  }
}

function resolveDraftModel(input: {
  draftModel: string
  providerModels: string[] | null
  providerSelectedModel: string | null | undefined
}): string {
  const normalizedDraftModel = input.draftModel.trim()
  if (input.providerModels && input.providerModels.includes(normalizedDraftModel)) {
    return normalizedDraftModel
  }

  if (!input.providerModels && normalizedDraftModel.length > 0) {
    return normalizedDraftModel
  }

  return input.providerSelectedModel?.trim() || input.providerModels?.[0] || ''
}

function toWorkspaceRouteScope(workspaceId: string | null | undefined): ThreadRouteScope {
  if (workspaceId && workspaceId.trim().length > 0) {
    return {
      kind: 'workspace',
      workspaceId
    }
  }

  return {
    kind: 'chats'
  }
}

export type ThreadPageController = ReturnType<typeof useThreadPageController>

export function useThreadPageController() {
  const { t } = useTranslation()
  const params = useParams()
  const location = useLocation()
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
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useWorkspaces()
  const createThreadMutation = useCreateThread()
  const deleteThreadMutation = useDeleteThread()
  const relocateWorkspaceMutation = useRelocateWorkspace()
  const deleteWorkspaceMutation = useDeleteWorkspace()

  // Filter to only show enabled providers
  const providers = useMemo(
    () => allProviders.filter((provider) => provider.enabled),
    [allProviders]
  )

  // Local state for threads (will be replaced by useThreads hook)
  const [threads, setThreads] = useState<ThreadRecord[]>([])

  // Derived loading states
  const isLoadingData = isLoadingAssistants || isLoadingProviders || isLoadingWorkspaces
  const loadError = assistantsError
    ? toErrorMessage(assistantsError)
    : providersError
      ? toErrorMessage(providersError)
      : null

  // UI state
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false)
  const pendingThreadMessageRef = useRef<PendingThreadMessage | null>(null)
  const activePendingUserMessagesRef = useRef(new Map<string, UIMessage>())
  const [hasPendingMessage, setHasPendingMessage] = useState(false)
  const [draftProviderId, setDraftProviderId] = useState('')
  const [draftModel, setDraftModel] = useState('')
  const hasLoadedInitialMessagesRef = useRef(false)
  const profileId = useMemo(() => getActiveResourceId(), [])

  const chatsWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.builtInKind === 'chats') ?? null,
    [workspaces]
  )
  const selectedWorkspace = useMemo(() => {
    if (params.workspaceId) {
      return workspaces.find((workspace) => workspace.id === params.workspaceId) ?? null
    }

    return chatsWorkspace
  }, [chatsWorkspace, params.workspaceId, workspaces])
  const routeScope = useMemo(() => {
    if (selectedWorkspace?.builtInKind === 'chats') {
      return toWorkspaceRouteScope(null)
    }

    return toWorkspaceRouteScope(selectedWorkspace?.id)
  }, [selectedWorkspace?.builtInKind, selectedWorkspace?.id])
  const workspaceDefaultAssistant = useMemo(() => {
    return resolveWorkspaceAssistant({
      assistants,
      workspace: selectedWorkspace
    })
  }, [assistants, selectedWorkspace])
  const baseRoute = useMemo(() => routeToThread(routeScope), [routeScope])
  const isNewThreadRoute = useMemo(() => {
    if (routeScope.kind === 'chats') {
      return location.pathname === '/chat/new'
    }

    return location.pathname === routeToNewThread(routeScope)
  }, [location.pathname, routeScope])

  const selectedThread = useMemo(() => {
    if (!params.threadId) {
      return null
    }

    return threads.find((thread) => thread.id === params.threadId) ?? null
  }, [params.threadId, threads])
  const selectedAssistant = useMemo(() => {
    if (!selectedThread) {
      return workspaceDefaultAssistant
    }

    return (
      assistants.find((assistant) => assistant.id === selectedThread.assistantId) ??
      workspaceDefaultAssistant
    )
  }, [assistants, selectedThread, workspaceDefaultAssistant])
  const selectedThreadProviderOverride = useMemo(
    () => readThreadProviderOverride(selectedThread?.metadata),
    [selectedThread?.metadata]
  )
  const effectiveProviderId = useMemo(() => {
    if (selectedThreadProviderOverride) {
      return selectedThreadProviderOverride.providerId
    }

    if (!selectedThread) {
      return draftProviderId.trim()
    }

    return selectedAssistant?.providerId?.trim() ?? ''
  }, [
    draftProviderId,
    selectedAssistant?.providerId,
    selectedThread,
    selectedThreadProviderOverride
  ])
  const effectiveModel = useMemo(() => {
    if (selectedThreadProviderOverride) {
      return selectedThreadProviderOverride.model
    }

    if (!selectedThread) {
      return draftModel.trim()
    }

    const selectedProvider = providers.find((provider) => provider.id === effectiveProviderId)
    return selectedProvider?.selectedModel?.trim() ?? ''
  }, [draftModel, effectiveProviderId, providers, selectedThread, selectedThreadProviderOverride])
  const effectiveProvider = useMemo(
    () => providers.find((provider) => provider.id === effectiveProviderId) ?? null,
    [effectiveProviderId, providers]
  )
  const readinessAssistant = useMemo(() => {
    if (!selectedAssistant) {
      return null
    }

    return {
      ...selectedAssistant,
      providerId: effectiveProviderId
    }
  }, [effectiveProviderId, selectedAssistant])
  const readinessProviders = useMemo(() => {
    if (!effectiveProvider || effectiveModel.length === 0) {
      return providers
    }

    return providers.map((provider) =>
      provider.id === effectiveProvider.id
        ? {
            ...provider,
            selectedModel: effectiveModel
          }
        : provider
    )
  }, [effectiveModel, effectiveProvider, providers])
  const tokenUsage = useMemo(() => selectedThread?.usageTotals ?? null, [selectedThread])

  const readiness = useMemo(() => {
    return evaluateAssistantReadiness({
      assistant: readinessAssistant,
      providers: readinessProviders
    })
  }, [readinessAssistant, readinessProviders])

  const supportsVision = useMemo(() => {
    if (!effectiveProvider) {
      return false
    }

    return effectiveProvider.supportsVision ?? false
  }, [effectiveProvider])

  const sidebarBranches = useMemo(() => {
    return buildWorkspaceThreadBranches({
      assistant: workspaceDefaultAssistant,
      workspaceName: selectedWorkspace?.name ?? 'Chats',
      threads
    })
  }, [selectedWorkspace?.name, threads, workspaceDefaultAssistant])

  const chatTransport = useMemo(() => {
    if (!selectedAssistant || !selectedThread) {
      return undefined
    }

    return createThreadChatTransport({
      threadId: selectedThread.id,
      profileId
    })
  }, [profileId, selectedAssistant, selectedThread])

  const chat = useChat({
    id: selectedThread ? selectedThread.id : 'default-chat',
    transport: chatTransport,
    resume: false,
    experimental_throttle: 48,
    onFinish: ({ isDisconnect, isError }) => {
      const selectedWorkspaceId = selectedWorkspace?.id
      const selectedThreadId = selectedThread?.id

      if (selectedThreadId && isError && !isDisconnect) {
        activePendingUserMessagesRef.current.delete(selectedThreadId)
      }

      if (!selectedThreadId || !selectedWorkspaceId) {
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

      void listThreads({ workspaceId: selectedWorkspaceId })
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

  useEffect(() => {
    if (selectedThread) {
      return
    }

    const defaultProvider =
      providers.find(
        (provider) => provider.id === workspaceDefaultAssistant?.providerId && provider.enabled
      ) ??
      providers[0] ??
      null
    const nextProviderId =
      draftProviderId && providers.some((provider) => provider.id === draftProviderId)
        ? draftProviderId
        : (defaultProvider?.id ?? '')

    if (nextProviderId !== draftProviderId) {
      setDraftProviderId(nextProviderId)
    }

    const selectedProvider =
      providers.find((provider) => provider.id === nextProviderId) ?? defaultProvider
    const nextModel = resolveDraftModel({
      draftModel,
      providerModels: selectedProvider?.providerModels ?? null,
      providerSelectedModel: selectedProvider?.selectedModel
    })

    if (nextModel !== draftModel) {
      setDraftModel(nextModel)
    }
  }, [
    draftModel,
    draftProviderId,
    providers,
    selectedThread,
    workspaceDefaultAssistant?.providerId
  ])

  useEffect(() => {
    if (isLoadingData) {
      return
    }

    if (!selectedWorkspace) {
      navigate('/chat', { replace: true })
      return
    }

    if (isNewThreadRoute || params.threadId) {
      return
    }

    let active = true

    const resolveWorkspaceRoute = async (): Promise<void> => {
      try {
        const workspaceThreads = sortThreadsByRecentActivity(
          await listThreads({ workspaceId: selectedWorkspace.id })
        )
        const storedSelection = readStoredThreadSelection(routeScope)
        if (storedSelection?.threadId) {
          const matchedThread = workspaceThreads.find(
            (thread) => thread.id === storedSelection.threadId
          )
          if (matchedThread) {
            if (!active) {
              return
            }
            navigate(routeToThread(routeScope, matchedThread.id), { replace: true })
            return
          }
        }

        const latestThread = findLatestThread(workspaceThreads)
        if (latestThread) {
          if (!active) {
            return
          }
          navigate(routeToThread(routeScope, latestThread.id), { replace: true })
          return
        }

        if (!active) {
          return
        }
        navigate(routeToNewThread(routeScope), { replace: true })
      } catch (error) {
        if (!active) {
          return
        }
        toast.error(toErrorMessage(error))
        navigate(baseRoute, { replace: true })
      }
    }

    void resolveWorkspaceRoute()

    return () => {
      active = false
    }
  }, [
    baseRoute,
    isLoadingData,
    isNewThreadRoute,
    navigate,
    params.threadId,
    params.workspaceId,
    routeScope,
    selectedWorkspace
  ])

  const { data: threadsData = [], isLoading: isLoadingThreads } = useThreads(
    { workspaceId: selectedWorkspace?.id },
    {
      enabled: !!selectedWorkspace
    }
  )

  useEffect(() => {
    setThreads((currentThreads) =>
      resolveVisibleThreads({
        currentThreads,
        threads: threadsData
      })
    )
  }, [threadsData])

  useEffect(() => {
    if (!selectedThread?.id) {
      return
    }

    storeThreadSelection(routeScope, {
      threadId: selectedThread.id
    })
  }, [routeScope, selectedThread?.id])

  useEffect(() => {
    if (!params.threadId || isLoadingThreads || !selectedWorkspace) {
      return
    }

    if (
      threads.some((thread) => thread.id === params.threadId) ||
      threadsData.some((thread) => thread.id === params.threadId)
    ) {
      return
    }

    navigate(baseRoute, { replace: true })
  }, [
    baseRoute,
    isLoadingThreads,
    navigate,
    params.threadId,
    selectedWorkspace,
    threads,
    threadsData
  ])

  useEffect(() => {
    const assistantId = selectedThread?.assistantId ?? selectedAssistant?.id
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
    selectedThread?.assistantId,
    selectedThread?.id
  ])

  useEffect(() => {
    const assistantIds = Array.from(
      new Set(
        [workspaceDefaultAssistant?.id, ...threads.map((thread) => thread.assistantId)].filter(
          (assistantId): assistantId is string =>
            typeof assistantId === 'string' && assistantId.length > 0
        )
      )
    )

    if (assistantIds.length === 0 || !selectedWorkspace?.id) {
      return
    }

    const streamHandles = assistantIds.map((assistantId) =>
      openAssistantMessageEventsStream({
        assistantId,
        profileId,
        onEvent: (event) => {
          if (event.type !== 'thread-messages-updated' || event.profileId !== profileId) {
            return
          }

          if (selectedThread?.id === event.threadId) {
            void listThreadChatMessages({
              threadId: selectedThread.id,
              profileId
            })
              .then((messages) => {
                setMessages(mergeHydratedThreadMessages(selectedThread.id, messages))
              })
              .catch(() => undefined)
          }

          void listThreads({ workspaceId: selectedWorkspace.id })
            .then((latestThreads) => {
              setThreads(sortThreadsByRecentActivity(latestThreads))
            })
            .catch(() => undefined)
        }
      })
    )

    return () => {
      streamHandles.forEach((streamHandle) => {
        streamHandle.close()
      })
    }
  }, [
    mergeHydratedThreadMessages,
    profileId,
    selectedThread?.assistantId,
    selectedThread?.id,
    selectedWorkspace?.id,
    setMessages,
    threads,
    workspaceDefaultAssistant?.id
  ])

  const createNewThread = useCallback(
    async (options?: {
      notify?: boolean
      replace?: boolean
      providerOverride?: ThreadProviderOverride
    }): Promise<ThreadRecord | null> => {
      if (!workspaceDefaultAssistant || !selectedWorkspace) {
        return null
      }

      try {
        const createdThread = await createThreadMutation.mutateAsync({
          assistantId: workspaceDefaultAssistant.id,
          workspaceId: selectedWorkspace.id,
          providerOverride: options?.providerOverride,
          resourceId: getActiveResourceId(),
          title: createThreadTitle()
        })
        setThreads((currentThreads) =>
          sortThreadsByRecentActivity([createdThread, ...currentThreads])
        )
        navigate(routeToThread(routeScope, createdThread.id), {
          replace: options?.replace ?? false
        })
        if (options?.notify ?? true) {
          toast.success(t('threads.toasts.threadCreated'))
        }
        return createdThread
      } catch (error) {
        toast.error(toErrorMessage(error))
        return null
      }
    },
    [createThreadMutation, navigate, routeScope, selectedWorkspace, t, workspaceDefaultAssistant]
  )

  const handleDeleteThread = async (thread: ThreadRecord): Promise<void> => {
    try {
      await deleteThreadMutation.mutateAsync(thread.id)
      setThreads((currentThreads) => currentThreads.filter((item) => item.id !== thread.id))
      if (selectedThread?.id === thread.id) {
        navigate(baseRoute, { replace: true })
      }
      toast.success(t('threads.toasts.threadRemoved'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

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

    const providerOverride =
      effectiveProviderId && effectiveModel
        ? {
            providerId: effectiveProviderId,
            model: effectiveModel
          }
        : null
    const createdThread = await createNewThread({
      notify: false,
      replace: isNewThreadRoute,
      providerOverride: providerOverride ?? undefined
    })
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

  const handleSelectThread = useCallback(
    (threadId: string) => {
      navigate(routeToThread(routeScope, threadId))
    },
    [navigate, routeScope]
  )

  const handleOpenNewThread = useCallback(() => {
    navigate(routeToNewThread(routeScope))
  }, [navigate, routeScope])

  const handleSelectDraftWorkspace = useCallback(
    (workspaceId: string) => {
      const nextScope = toWorkspaceRouteScope(
        workspaces.find((workspace) => workspace.id === workspaceId)?.builtInKind === 'chats'
          ? null
          : workspaceId
      )
      navigate(routeToNewThread(nextScope))
    },
    [navigate, workspaces]
  )

  const handleRelocateWorkspace = useCallback(async (): Promise<void> => {
    if (!selectedWorkspace || selectedWorkspace.builtInKind === 'chats') {
      return
    }

    const nextRootPath = await window.tiaDesktop?.pickDirectory()
    if (!nextRootPath) {
      return
    }

    try {
      await relocateWorkspaceMutation.mutateAsync({
        workspaceId: selectedWorkspace.id,
        input: {
          rootPath: nextRootPath
        }
      })
      toast.success('Workspace folder updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to relocate workspace')
    }
  }, [relocateWorkspaceMutation, selectedWorkspace])

  const handleDeleteWorkspace = useCallback(async (): Promise<void> => {
    if (!selectedWorkspace || selectedWorkspace.builtInKind === 'chats') {
      return
    }

    const confirmed = window.confirm(
      `Delete the workspace "${selectedWorkspace.name}" and remove its TIA threads?`
    )
    if (!confirmed) {
      return
    }

    try {
      await deleteWorkspaceMutation.mutateAsync(selectedWorkspace.id)
      toast.success('Workspace deleted.')
      navigate('/chat', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete workspace')
    }
  }, [deleteWorkspaceMutation, navigate, selectedWorkspace])

  return {
    chatLabel: selectedWorkspace?.name ?? 'Chats',
    selectedWorkspace,
    workspaces,
    providers,
    isNewThreadRoute,
    draftProviderId,
    draftModel,
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
    isLoadingChatHistory,
    isChatStreaming,
    chatError,
    loadError,
    canAbortGeneration,
    tokenUsage,
    onCreateThread: () => {
      handleOpenNewThread()
    },
    onSelectDraftWorkspace: handleSelectDraftWorkspace,
    onDraftProviderChange: setDraftProviderId,
    onDraftModelChange: setDraftModel,
    onRelocateWorkspace: () => {
      void handleRelocateWorkspace()
    },
    onDeleteWorkspace: () => {
      void handleDeleteWorkspace()
    },
    isRelocatingWorkspace: relocateWorkspaceMutation.isPending,
    isDeletingWorkspace: deleteWorkspaceMutation.isPending,
    onSelectThread: handleSelectThread,
    onDeleteThread: (thread: ThreadRecord) => {
      void handleDeleteThread(thread)
    },
    onSubmitMessage: handleSubmitMessage,
    onAbortGeneration: handleAbortGeneration
  }
}

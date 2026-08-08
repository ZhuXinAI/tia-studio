import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type CompleteAttachment,
  type ExternalThreadQueueAdapter
} from '@assistant-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentAttachment,
  AgentSendBehavior,
  AgentSessionSnapshot,
  AgentSessionView,
  AppAgentMessage,
  AgentMessagePart
} from '../../../../../shared/agent-runtime'
import { reduceAgentEvent } from '../../../../../shared/agent-runtime'
import { cancelAgentRun, sendAgentMessage, subscribeToAgentSession } from '../agent-sessions-query'
import { mergeAssistantRunMessages } from './pi-thread-message-groups'
import {
  createOptimisticUserMessage,
  reconcileOptimisticUserMessages,
  settleOptimisticUserMessage,
  type OptimisticUserMessage
} from './pi-thread-optimistic-messages'
import { resolveActiveSendBehavior } from './pi-thread-send-behavior'

function dataUrlToAttachment(input: {
  id: string
  name: string
  contentType?: string
  image: string
}): AgentAttachment | null {
  const match = input.image.match(/^data:(image\/[^;]+);base64,(.+)$/)
  if (!match) return null
  const data = match[2]
  return {
    id: input.id,
    type: 'image',
    name: input.name,
    mimeType: input.contentType || match[1],
    size: Math.floor((data.length * 3) / 4),
    data
  }
}

function extractAppendMessage(message: AppendMessage): {
  text: string
  attachments: AgentAttachment[]
} {
  const text = message.content
    .filter(
      (part): part is Extract<(typeof message.content)[number], { type: 'text' }> =>
        part.type === 'text'
    )
    .map((part) => part.text)
    .join('\n')
  const attachments = (message.attachments ?? []).flatMap((attachment) =>
    attachment.content.flatMap((part) => {
      if (part.type !== 'image') return []
      const converted = dataUrlToAttachment({
        id: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType,
        image: part.image
      })
      return converted ? [converted] : []
    })
  )
  return { text, attachments }
}

function convertPart(part: AgentMessagePart) {
  switch (part.type) {
    case 'text':
      return { type: 'text' as const, text: part.text }
    case 'thinking':
      return { type: 'reasoning' as const, text: part.text }
    case 'image':
      return { type: 'image' as const, image: `data:${part.mimeType};base64,${part.data}` }
    case 'tool':
      return {
        type: 'tool-call' as const,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args:
          part.input && typeof part.input === 'object' && !Array.isArray(part.input)
            ? (part.input as Record<string, never>)
            : {},
        result: part.output,
        isError: part.status === 'error'
      }
    case 'notice':
      return { type: 'text' as const, text: part.text }
  }
}

function convertImageAttachment(
  part: Extract<AgentMessagePart, { type: 'image' }>
): CompleteAttachment {
  return {
    id: part.attachmentId,
    type: 'image',
    name: part.name,
    contentType: part.mimeType,
    status: { type: 'complete' },
    content: [{ type: 'image', image: `data:${part.mimeType};base64,${part.data}` }]
  }
}

function convertMessage(message: AppAgentMessage, session?: AgentSessionSnapshot) {
  const waitingOnUser = Boolean(session?.pendingInteraction) && message.status === 'streaming'
  const workStartedAtMs = new Date(message.createdAt).getTime()
  const waitingDurationMs = waitingOnUser
    ? Math.max(0, new Date(session?.updatedAt ?? message.createdAt).getTime() - workStartedAtMs)
    : undefined
  return {
    id: message.id,
    role: message.role,
    content: message.parts
      .filter((part) => message.role !== 'user' || part.type !== 'image')
      .map(convertPart),
    ...(message.role === 'user'
      ? {
          attachments: message.parts
            .filter((part) => part.type === 'image')
            .map(convertImageAttachment)
        }
      : {}),
    createdAt: new Date(message.createdAt),
    metadata: {
      custom: {
        workStartedAtMs,
        workDurationMs:
          waitingDurationMs ??
          (message.completedAt
            ? Math.max(0, new Date(message.completedAt).getTime() - workStartedAtMs)
            : undefined),
        waitingOnUser
      }
    },
    ...(message.role === 'assistant'
      ? {
          status:
            message.status === 'streaming'
              ? ({ type: 'running' } as const)
              : message.status === 'error'
                ? ({ type: 'incomplete', reason: 'error', error: message.error } as const)
                : ({ type: 'complete', reason: 'stop' } as const)
        }
      : {})
  }
}

export function PiThreadRuntimeProvider({
  session,
  initialMessages,
  behavior,
  onSessionChange,
  onError,
  children
}: {
  session: AgentSessionSnapshot
  initialMessages: AppAgentMessage[]
  behavior: AgentSendBehavior
  onSessionChange: (session: AgentSessionSnapshot) => void
  onError: (error: unknown) => void
  children: React.ReactNode
}): React.JSX.Element {
  const [view, setView] = useState<AgentSessionView>({
    snapshot: session,
    messages: initialMessages,
    seenEventIds: [],
    lastSequence: 0
  })
  const pendingOptimisticMessagesRef = useRef<OptimisticUserMessage[]>([])
  const onSessionChangeRef = useRef(onSessionChange)
  const onErrorRef = useRef(onError)
  const behaviorRef = useRef(behavior)
  const statusRef = useRef(session.status)
  const submitMessageRef = useRef<
    (message: AppendMessage, requestedBehavior: AgentSendBehavior) => Promise<void>
  >(async () => undefined)

  useEffect(() => {
    onSessionChangeRef.current = onSessionChange
    onErrorRef.current = onError
  }, [onError, onSessionChange])

  useEffect(() => {
    behaviorRef.current = behavior
  }, [behavior])

  useEffect(() => {
    setView((current) => ({ ...current, snapshot: session }))
    statusRef.current = session.status
  }, [session])

  useEffect(() => {
    const reconciled = reconcileOptimisticUserMessages(
      initialMessages,
      pendingOptimisticMessagesRef.current
    )
    pendingOptimisticMessagesRef.current = reconciled.pending
    setView((current) => ({
      ...current,
      messages: [...reconciled.messages, ...reconciled.pending.map((item) => item.message)]
    }))
  }, [initialMessages])

  useEffect(() => {
    return subscribeToAgentSession({
      sessionId: session.id,
      onEvent: (event) => {
        let settledOptimisticMessageId: string | null = null
        if (event.type === 'message.started' && event.message.role === 'user') {
          const settled = settleOptimisticUserMessage(
            [],
            pendingOptimisticMessagesRef.current,
            event.message
          )
          if (settled.pending.length !== pendingOptimisticMessagesRef.current.length) {
            settledOptimisticMessageId =
              pendingOptimisticMessagesRef.current.find(
                (item) => !settled.pending.some((pending) => pending.message.id === item.message.id)
              )?.message.id ?? null
            pendingOptimisticMessagesRef.current = settled.pending
          }
        }
        setView((current) => {
          const next = reduceAgentEvent(current, event)
          statusRef.current = next.snapshot.status
          if (settledOptimisticMessageId) {
            next.messages = next.messages.filter(
              (message) => message.id !== settledOptimisticMessageId
            )
          }
          onSessionChangeRef.current(next.snapshot)
          return next
        })
      },
      onError: (error) => onErrorRef.current(error)
    })
  }, [session.id])

  const adapters = useMemo(() => ({ attachments: new SimpleImageAttachmentAdapter() }), [])
  const convertMessageForView = useCallback(
    (message: AppAgentMessage) => convertMessage(message, view.snapshot),
    [view.snapshot]
  )

  const submitMessage = useCallback(
    async (message: AppendMessage, requestedBehavior: AgentSendBehavior): Promise<void> => {
      const content = extractAppendMessage(message)
      const optimistic = createOptimisticUserMessage(session.id, content)
      const previousStatus = statusRef.current
      pendingOptimisticMessagesRef.current = [
        ...pendingOptimisticMessagesRef.current,
        optimistic
      ]
      statusRef.current = 'running'
      setView((current) => ({
        ...current,
        messages: [...current.messages, optimistic.message],
        snapshot: { ...current.snapshot, status: 'running' }
      }))
      try {
        const receipt = await sendAgentMessage({
          sessionId: session.id,
          behavior: resolveActiveSendBehavior(previousStatus, requestedBehavior),
          ...content
        })
        if (!receipt.accepted) throw new Error(receipt.error ?? 'Pi rejected the message')
      } catch (error) {
        pendingOptimisticMessagesRef.current = pendingOptimisticMessagesRef.current.filter(
          (item) => item.message.id !== optimistic.message.id
        )
        statusRef.current = previousStatus
        setView((current) => ({
          ...current,
          messages: current.messages.filter((item) => item.id !== optimistic.message.id),
          snapshot: { ...current.snapshot, status: previousStatus }
        }))
        throw error
      }
    },
    [session.id]
  )

  useEffect(() => {
    submitMessageRef.current = submitMessage
  }, [submitMessage])

  // The main process owns the authoritative follow-up/steer queue. Providing
  // this adapter keeps Assistant UI's composer enabled during a run while
  // preserving that server-side queue and its live queue.changed events.
  const queue = useMemo<ExternalThreadQueueAdapter>(
    () => ({
      items: [],
      enqueue: (message, options) => {
        void submitMessageRef.current(
          message,
          options.steer ? 'steer' : behaviorRef.current
        ).catch((error) => onErrorRef.current(error))
      },
      steer: () => undefined,
      remove: () => undefined,
      clear: () => undefined
    }),
    []
  )

  const runtime = useExternalStoreRuntime({
    isRunning: view.snapshot.status === 'running',
    isLoading: view.snapshot.status === 'starting' || view.snapshot.status === 'recovering',
    messages: mergeAssistantRunMessages(view.messages),
    convertMessage: convertMessageForView,
    adapters,
    queue,
    onNew: (message) => submitMessage(message, behaviorRef.current),
    onCancel: async () => {
      const previousStatus = view.snapshot.status
      setView((current) => ({
        ...current,
        snapshot: { ...current.snapshot, status: 'idle' }
      }))
      try {
        await cancelAgentRun(session.id)
      } catch (error) {
        setView((current) => ({
          ...current,
          snapshot: { ...current.snapshot, status: previousStatus }
        }))
        throw error
      }
    },
    unstable_capabilities: { copy: true }
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

export function NewPiThreadRuntimeProvider({
  createSession,
  onCreatingChange,
  onCreated,
  onError,
  children
}: {
  createSession: () => Promise<AgentSessionSnapshot>
  onCreatingChange?: (creating: boolean) => void
  onCreated: (session: AgentSessionSnapshot) => void
  onError: (error: unknown) => void
  children: React.ReactNode
}): React.JSX.Element {
  const adapters = useMemo(() => ({ attachments: new SimpleImageAttachmentAdapter() }), [])

  const runtime = useExternalStoreRuntime({
    isRunning: false,
    isLoading: false,
    messages: [] as AppAgentMessage[],
    convertMessage: (message) => convertMessage(message),
    adapters,
    onNew: async (message) => {
      onCreatingChange?.(true)
      try {
        const session = await createSession()
        onCreated(session)
        const receipt = await sendAgentMessage({
          sessionId: session.id,
          behavior: 'normal',
          ...extractAppendMessage(message)
        })
        if (!receipt.accepted) throw new Error(receipt.error ?? 'TIA Studio rejected the message')
      } catch (error) {
        onError(error)
        throw error
      } finally {
        onCreatingChange?.(false)
      }
    },
    onCancel: async () => undefined,
    unstable_capabilities: { copy: true }
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

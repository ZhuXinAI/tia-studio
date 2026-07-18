import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  WebSpeechDictationAdapter,
  useExternalStoreRuntime,
  type AppendMessage
} from '@assistant-ui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

function convertMessage(message: AppAgentMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.parts.map(convertPart),
    createdAt: new Date(message.createdAt),
    metadata: {
      custom: {
        workStartedAtMs: new Date(message.createdAt).getTime(),
        workDurationMs: message.completedAt
          ? Math.max(
              0,
              new Date(message.completedAt).getTime() - new Date(message.createdAt).getTime()
            )
          : undefined
      }
    },
    ...(message.role === 'assistant'
      ? {
          status:
            message.status === 'streaming'
              ? ({ type: 'running' } as const)
              : message.status === 'error'
                ? ({ type: 'incomplete', reason: 'error' } as const)
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
  const onSessionChangeRef = useRef(onSessionChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onSessionChangeRef.current = onSessionChange
    onErrorRef.current = onError
  }, [onError, onSessionChange])

  useEffect(() => {
    setView((current) => ({ ...current, snapshot: session }))
  }, [session])

  useEffect(() => {
    setView((current) => ({ ...current, messages: initialMessages }))
  }, [initialMessages])

  useEffect(() => {
    return subscribeToAgentSession({
      sessionId: session.id,
      onEvent: (event) => {
        setView((current) => {
          const next = reduceAgentEvent(current, event)
          onSessionChangeRef.current(next.snapshot)
          return next
        })
      },
      onError: (error) => onErrorRef.current(error)
    })
  }, [session.id])

  const adapters = useMemo(
    () => ({
      attachments: new SimpleImageAttachmentAdapter(),
      ...(WebSpeechDictationAdapter.isSupported()
        ? { dictation: new WebSpeechDictationAdapter({ continuous: true, interimResults: true }) }
        : {})
    }),
    []
  )

  const runtime = useExternalStoreRuntime({
    isRunning: view.snapshot.status === 'running',
    isLoading: view.snapshot.status === 'starting' || view.snapshot.status === 'recovering',
    messages: mergeAssistantRunMessages(view.messages),
    convertMessage,
    adapters,
    onNew: async (message) => {
      const content = extractAppendMessage(message)
      const receipt = await sendAgentMessage({
        sessionId: session.id,
        behavior: view.snapshot.status === 'running' ? behavior : 'normal',
        ...content
      })
      if (!receipt.accepted) throw new Error(receipt.error ?? 'Pi rejected the message')
    },
    onCancel: async () => cancelAgentRun(session.id),
    unstable_capabilities: { copy: true }
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

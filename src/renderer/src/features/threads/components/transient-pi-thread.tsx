import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type {
  AgentSessionSnapshot,
  AgentTransientPurpose
} from '../../../../../shared/agent-runtime'
import { Thread, type ThreadComponents } from '../../../components/assistant-ui/thread'
import {
  agentSessionKeys,
  closeTransientAgentSession,
  createTransientAgentSession,
  promoteTransientAgentSession,
  useAgentMessages
} from '../agent-sessions-query'
import { NewPiThreadRuntimeProvider, PiThreadRuntimeProvider } from './pi-thread-runtime'
import { toErrorMessage } from '../thread-page-routing'

export type TransientPiThreadContext = {
  session: AgentSessionSnapshot | null
  hasAssistantResponse: boolean
  isPromoting: boolean
  continueInChat: () => void
}

type TransientPiThreadProvider = {
  id: string
  type: string
  selectedModel: string
}

/**
 * Runs a Pi-backed Thread without creating a durable Pi file or a Chats row.
 * Leaving the surface disposes it; Continue in Chat is the only promotion path.
 */
export function TransientPiThread({
  purpose,
  provider,
  getComponents,
  onSessionSettled
}: {
  purpose: AgentTransientPurpose
  provider: TransientPiThreadProvider
  getComponents: (context: TransientPiThreadContext) => ThreadComponents
  onSessionSettled?: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const { data: messages = [], refetch: refetchMessages } = useAgentMessages(session?.id ?? null)

  useEffect(() => {
    const sessionId = session?.id
    return () => {
      if (!sessionId) return
      void closeTransientAgentSession(sessionId).catch(() => undefined)
    }
  }, [session?.id])

  const continueInChat = useCallback(async () => {
    if (!session || isPromoting) return
    setIsPromoting(true)
    try {
      const promoted = await promoteTransientAgentSession(session.id)
      queryClient.setQueryData(agentSessionKeys.detail(promoted.id), promoted)
      await queryClient.invalidateQueries({ queryKey: agentSessionKeys.all })
      navigate(`/chat/${promoted.id}`)
    } catch (error) {
      toast.error(toErrorMessage(error))
      setIsPromoting(false)
    }
  }, [isPromoting, navigate, queryClient, session])

  const hasAssistantResponse = messages.some(
    (message) => message.role === 'assistant' && message.status === 'complete'
  )
  const context: TransientPiThreadContext = {
    session,
    hasAssistantResponse,
    isPromoting,
    continueInChat: () => void continueInChat()
  }

  if (!session) {
    return (
      <NewPiThreadRuntimeProvider
        createSession={() =>
          createTransientAgentSession({
            purpose,
            providerId: provider.id,
            provider: provider.type,
            modelId: provider.selectedModel,
            accessMode: 'standard'
          })
        }
        onCreatingChange={setIsCreating}
        onCreated={setSession}
        onError={(error) => toast.error(toErrorMessage(error))}
      >
        <Thread composerDisabled={isCreating} components={getComponents(context)} />
      </NewPiThreadRuntimeProvider>
    )
  }

  return (
    <PiThreadRuntimeProvider
      key={session.id}
      session={session}
      initialMessages={messages}
      behavior="normal"
      onError={(error) => toast.error(toErrorMessage(error))}
      onSessionChange={(updated) => {
        setSession(updated)
        if (updated.status === 'idle') {
          void refetchMessages()
          onSessionSettled?.()
        }
      }}
    >
      <Thread composerDisabled={isPromoting} components={getComponents(context)} />
    </PiThreadRuntimeProvider>
  )
}

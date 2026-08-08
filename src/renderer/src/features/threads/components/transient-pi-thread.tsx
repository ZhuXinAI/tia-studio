import { useQueryClient } from '@tanstack/react-query'
import { AssistantModalPrimitive } from '@assistant-ui/react'
import { MessageCircle, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type {
  AgentSessionSnapshot,
  AgentTransientPurpose
} from '../../../../../shared/agent-runtime'
import { Thread, type ThreadComponents } from '../../../components/assistant-ui/thread'
import { Button } from '../../../components/ui/button'
import {
  agentSessionKeys,
  closeTransientAgentSession,
  createTransientAgentSession,
  promoteTransientAgentSession,
  useAgentMessages
} from '../agent-sessions-query'
import { NewPiThreadRuntimeProvider, PiThreadRuntimeProvider } from './pi-thread-runtime'
import { restartTransientSession } from './transient-pi-thread-restart'
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

type TransientThreadPresentation =
  | { type?: 'inline' }
  | {
      type: 'modal'
      title: string
      description: string
      triggerLabel: string
    }

function TransientThreadSurface({
  presentation,
  canRestart,
  isRestarting,
  onRestart,
  children
}: {
  presentation: TransientThreadPresentation
  canRestart: boolean
  isRestarting: boolean
  onRestart: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  if (presentation.type !== 'modal') return <>{children}</>

  return (
    <AssistantModalPrimitive.Root open={open} onOpenChange={setOpen}>
      <AssistantModalPrimitive.Anchor>
        <AssistantModalPrimitive.Trigger asChild>
          <Button type="button" size="sm" variant="outline" aria-label={presentation.triggerLabel}>
            <MessageCircle className="size-4" />
            {presentation.triggerLabel}
          </Button>
        </AssistantModalPrimitive.Trigger>
      </AssistantModalPrimitive.Anchor>
      <AssistantModalPrimitive.Content
        side="bottom"
        align="end"
        sideOffset={10}
        dissmissOnInteractOutside={false}
        aria-label={presentation.title}
        className="z-[100] flex max-h-[calc(100dvh-2rem)] min-h-0 min-w-0 h-[min(42rem,var(--radix-popover-content-available-height))] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-background shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--surface-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{presentation.title}</h2>
            <p className="truncate text-xs text-muted-foreground">{presentation.description}</p>
          </div>
          {canRestart ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Start over"
              title="Start over"
              disabled={isRestarting}
              onClick={onRestart}
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
          <AssistantModalPrimitive.Trigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label="Close assistant">
              <X className="size-4" />
            </Button>
          </AssistantModalPrimitive.Trigger>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  )
}

/**
 * Runs a Pi-backed Thread without creating a durable Pi file or a Chats row.
 * Leaving the surface disposes it; Continue in Chat is the only promotion path.
 */
export function TransientPiThread({
  purpose,
  provider,
  getComponents,
  onSessionSettled,
  presentation = { type: 'inline' }
}: {
  purpose: AgentTransientPurpose
  provider: TransientPiThreadProvider
  getComponents: (context: TransientPiThreadContext) => ThreadComponents
  onSessionSettled?: () => void
  presentation?: TransientThreadPresentation
}): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const explicitlyClosedSessions = useRef(new Set<string>())
  const { data: messages = [], refetch: refetchMessages } = useAgentMessages(session?.id ?? null)

  useEffect(() => {
    const sessionId = session?.id
    const explicitlyClosed = explicitlyClosedSessions.current
    return () => {
      if (!sessionId) return
      if (explicitlyClosed.delete(sessionId)) return
      void closeTransientAgentSession(sessionId).catch(() => undefined)
    }
  }, [session?.id])

  const restart = useCallback(async () => {
    if (!session || isRestarting) return
    setIsRestarting(true)
    try {
      await restartTransientSession(session.id, closeTransientAgentSession, () => {
        explicitlyClosedSessions.current.add(session.id)
        setSession(null)
        setIsPromoting(false)
      })
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsRestarting(false)
    }
  }, [isRestarting, session])

  const continueInChat = useCallback(async () => {
    if (!session || isPromoting) return
    setIsPromoting(true)
    try {
      const promoted = await promoteTransientAgentSession(session.id)
      queryClient.setQueryData(agentSessionKeys.detail(promoted.id), promoted)
      navigate(`/chat/${promoted.id}`)
      void queryClient.invalidateQueries({ queryKey: agentSessionKeys.all })
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

  const runtimeThread = !session ? (
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
  ) : (
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
      <Thread composerDisabled={isPromoting || isRestarting} components={getComponents(context)} />
    </PiThreadRuntimeProvider>
  )

  return (
    <TransientThreadSurface
      presentation={presentation}
      canRestart={session !== null}
      isRestarting={isRestarting}
      onRestart={() => void restart()}
    >
      {runtimeThread}
    </TransientThreadSurface>
  )
}

import { Shield, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  AgentInteractionRequest,
  AgentSendBehavior,
  AgentSessionSnapshot
} from '../../../../shared/agent-runtime'
import { Thread } from '../../components/assistant-ui/thread'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import {
  agentSessionKeys,
  renameAgentSession,
  respondToAgentInteraction,
  setAgentAccessMode,
  useAgentMessages,
  useAgentSession,
  useCreateAgentSession
} from '../../features/threads/agent-sessions-query'
import { PiThreadRuntimeProvider } from '../../features/threads/components/pi-thread-runtime'
import { useProviders } from '../../features/settings/providers/providers-query'
import { useWorkspaces } from '../../features/workspaces/workspaces-query'
import { toErrorMessage } from '../../features/threads/thread-page-routing'
import { ChatMetaPill } from '../../components/assistant-ui/chat-surface'
import { useAppV2ShellStatusBar } from './app-v2-shell-status'
import { useAppV2ShellRightRail } from './app-v2-shell-right-rail'

function sessionHref(session: AgentSessionSnapshot): string {
  return session.workspaceId
    ? `/workspaces/${session.workspaceId}/threads/${session.id}`
    : `/chat/${session.id}`
}

function InteractionCard({
  sessionId,
  request
}: {
  sessionId: string
  request: AgentInteractionRequest
}): React.JSX.Element {
  const [value, setValue] = useState(request.method === 'editor' ? (request.prefill ?? '') : '')
  const [isPending, setIsPending] = useState(false)

  async function respond(
    response:
      | { id: string; confirmed: boolean }
      | { id: string; value: string }
      | { id: string; cancelled: true }
  ): Promise<void> {
    setIsPending(true)
    try {
      await respondToAgentInteraction(sessionId, response)
    } catch (error) {
      toast.error(toErrorMessage(error))
      setIsPending(false)
    }
  }

  return (
    <div className="border-border bg-muted/40 mx-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{request.title}</p>
        {request.method === 'confirm' ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{request.message}</p>
        ) : null}
      </div>
      {request.method === 'confirm' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, confirmed: false })}
          >
            Deny
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, confirmed: true })}
          >
            Allow once
          </Button>
        </>
      ) : request.method === 'select' ? (
        request.options.map((option) => (
          <Button
            key={option}
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, value: option })}
          >
            {option}
          </Button>
        ))
      ) : (
        <>
          <Input
            value={value}
            placeholder={request.method === 'input' ? request.placeholder : undefined}
            className="h-8 min-w-48 flex-1"
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, value })}
          >
            Submit
          </Button>
        </>
      )}
    </div>
  )
}

export function ThreadPageV2(): React.JSX.Element {
  const params = useParams<{ workspaceId?: string; threadId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createSession = useCreateAgentSession()
  const { data: workspaces = [], isLoading: workspacesLoading } = useWorkspaces()
  const { data: providers = [], isLoading: providersLoading } = useProviders()
  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError
  } = useAgentSession(params.threadId ?? null)
  const { data: messages = [], isLoading: messagesLoading } = useAgentMessages(
    params.threadId ?? null
  )
  const [behavior, setBehavior] = useState<AgentSendBehavior>('steer')
  const [title, setTitle] = useState('')
  const creationStartedRef = useRef(false)
  const rightRail = useAppV2ShellRightRail()

  const workspace = useMemo(
    () =>
      params.workspaceId
        ? (workspaces.find((item) => item.id === params.workspaceId) ?? null)
        : (workspaces.find((item) => item.builtInKind === 'chats') ?? null),
    [params.workspaceId, workspaces]
  )
  const provider = useMemo(
    () =>
      providers.find((item) => item.enabled && item.isDefault) ??
      providers.find((item) => item.enabled),
    [providers]
  )

  useEffect(() => {
    rightRail.setHasContent(false)
  }, [rightRail])

  useEffect(() => {
    setTitle(session?.title ?? '')
  }, [session?.title])

  useEffect(() => {
    if (
      params.threadId ||
      creationStartedRef.current ||
      workspacesLoading ||
      providersLoading ||
      !workspace ||
      !provider
    ) {
      return
    }

    creationStartedRef.current = true
    void createSession
      .mutateAsync({
        workspaceId: workspace.builtInKind === 'chats' ? null : workspace.id,
        workspacePath: workspace.rootPath,
        providerId: provider.id,
        provider: provider.type,
        modelId: provider.selectedModel,
        accessMode: 'standard'
      })
      .then((created) => navigate(sessionHref(created), { replace: true }))
      .catch((error) => {
        toast.error(toErrorMessage(error))
      })
  }, [
    createSession,
    navigate,
    params.threadId,
    provider,
    providersLoading,
    workspace,
    workspacesLoading
  ])

  const statusContent = useMemo(
    () =>
      session ? (
        <>
          <ChatMetaPill>{session.status}</ChatMetaPill>
          <ChatMetaPill>{session.modelId}</ChatMetaPill>
          <ChatMetaPill icon={session.accessMode === 'full' ? ShieldCheck : Shield}>
            {session.accessMode === 'full' ? 'Full access' : 'Standard access'}
          </ChatMetaPill>
        </>
      ) : null,
    [session]
  )
  useAppV2ShellStatusBar(statusContent)

  async function commitTitle(): Promise<void> {
    if (!session || !title.trim() || title.trim() === session.title) return
    try {
      const updated = await renameAgentSession(session.id, title.trim())
      queryClient.setQueryData(agentSessionKeys.detail(session.id), updated)
      await queryClient.invalidateQueries({ queryKey: agentSessionKeys.all })
    } catch (error) {
      setTitle(session.title)
      toast.error(toErrorMessage(error))
    }
  }

  async function toggleAccess(full: boolean): Promise<void> {
    if (!session) return
    try {
      const updated = await setAgentAccessMode(session.id, full ? 'full' : 'standard')
      queryClient.setQueryData(agentSessionKeys.detail(session.id), updated)
      await queryClient.invalidateQueries({ queryKey: agentSessionKeys.all })
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  if (!params.threadId) {
    if (!providersLoading && !provider) {
      return (
        <div className="grid h-full place-items-center p-8 text-center">
          <div>
            <p className="font-medium">Configure a provider to start Pi.</p>
            <Button asChild variant="link">
              <NavLink to="/settings/providers">Open provider settings</NavLink>
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Starting Pi…
      </div>
    )
  }

  if (sessionLoading || messagesLoading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Loading thread…
      </div>
    )
  }

  if (!session || sessionError) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-destructive">
        {toErrorMessage(sessionError ?? new Error('Thread not found'))}
      </div>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <Input
          value={title}
          className="h-8 min-w-0 max-w-md border-transparent bg-transparent px-2 font-medium shadow-none"
          aria-label="Thread title"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span className="text-muted-foreground ml-auto text-xs capitalize">{session.status}</span>
        {session.status === 'running' ? (
          <select
            value={behavior}
            onChange={(event) => setBehavior(event.target.value as AgentSendBehavior)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            aria-label="Message behavior while Pi is running"
          >
            <option value="steer">Steer current run</option>
            <option value="follow-up">Queue follow-up</option>
          </select>
        ) : null}
        <label className="flex items-center gap-2 text-xs font-medium">
          <Switch
            checked={session.accessMode === 'full'}
            disabled={session.status === 'running'}
            onCheckedChange={(checked) => void toggleAccess(checked)}
            aria-label="Full access"
          />
          <span className={session.accessMode === 'full' ? 'text-primary' : undefined}>
            Full access
          </span>
        </label>
      </header>
      {session.pendingInteraction ? (
        <InteractionCard sessionId={session.id} request={session.pendingInteraction} />
      ) : null}
      <div className="min-h-0 flex-1">
        <PiThreadRuntimeProvider
          key={session.id}
          session={session}
          initialMessages={messages}
          behavior={behavior}
          onError={(error) => toast.error(toErrorMessage(error))}
          onSessionChange={(updated) => {
            queryClient.setQueryData(agentSessionKeys.detail(updated.id), updated)
            void queryClient.invalidateQueries({ queryKey: agentSessionKeys.all })
          }}
        >
          <Thread />
        </PiThreadRuntimeProvider>
      </div>
    </section>
  )
}

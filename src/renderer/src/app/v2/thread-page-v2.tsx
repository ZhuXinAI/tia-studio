import { Bot, Check, ChevronDown, Shield, ShieldCheck } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import {
  agentSessionKeys,
  respondToAgentInteraction,
  setAgentAccessMode,
  setAgentModel,
  useAgentMessages,
  useAgentSession,
  useCreateAgentSession
} from '../../features/threads/agent-sessions-query'
import { PiThreadRuntimeProvider } from '../../features/threads/components/pi-thread-runtime'
import { useProviders } from '../../features/settings/providers/providers-query'
import { useWorkspaces } from '../../features/workspaces/workspaces-query'
import { toErrorMessage } from '../../features/threads/thread-page-routing'
import { useAppV2ShellRightRail } from './app-v2-shell-right-rail'
import type { ProviderRecord } from '../../features/settings/providers/providers-query'

function ThreadComposerControls({
  session,
  provider,
  behavior,
  onBehaviorChange,
  onModelChange,
  onAccessChange
}: {
  session: AgentSessionSnapshot
  provider: ProviderRecord | null
  behavior: AgentSendBehavior
  onBehaviorChange: (behavior: AgentSendBehavior) => void
  onModelChange: (modelId: string) => void
  onAccessChange: (full: boolean) => void
}): React.JSX.Element {
  const models = Array.from(
    new Set(
      [session.modelId, provider?.selectedModel, ...(provider?.providerModels ?? [])].filter(
        Boolean
      )
    )
  ) as string[]
  const disabled = session.status === 'running'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-44 gap-1.5 rounded-lg px-2 text-xs font-normal text-muted-foreground"
            aria-label="Select model"
            disabled={disabled}
          >
            <Bot className="size-3.5 shrink-0" />
            <span className="truncate">{session.modelId}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-64">
          <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
            {provider?.name ?? session.provider}
          </DropdownMenuLabel>
          {models.map((modelId) => (
            <DropdownMenuItem key={modelId} onSelect={() => onModelChange(modelId)}>
              <span className="min-w-0 flex-1 truncate">{modelId}</span>
              {modelId === session.modelId ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-lg px-2 text-xs font-normal text-muted-foreground"
            aria-label="Select permission mode"
            disabled={disabled}
          >
            {session.accessMode === 'full' ? (
              <ShieldCheck className="size-3.5" />
            ) : (
              <Shield className="size-3.5" />
            )}
            {session.accessMode === 'full' ? 'Full Access' : 'Ask Permission'}
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-52">
          <DropdownMenuItem onSelect={() => onAccessChange(false)}>
            <Shield className="mr-2 size-4" />
            <span className="flex-1">Ask Permission</span>
            {session.accessMode === 'standard' ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAccessChange(true)}>
            <ShieldCheck className="mr-2 size-4" />
            <span className="flex-1">Full Access</span>
            {session.accessMode === 'full' ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          {session.status === 'running' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Permission mode is locked while Pi is running.
              </DropdownMenuLabel>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {session.status === 'running' ? (
        <select
          value={behavior}
          onChange={(event) => onBehaviorChange(event.target.value as AgentSendBehavior)}
          className="h-7 max-w-36 rounded-lg border-0 bg-transparent px-2 text-xs text-muted-foreground outline-none hover:bg-muted"
          aria-label="Message behavior while Pi is running"
        >
          <option value="steer">Steer current run</option>
          <option value="follow-up">Queue follow-up</option>
        </select>
      ) : null}
    </>
  )
}

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
  const [creationError, setCreationError] = useState<string | null>(null)
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
    if (
      params.threadId ||
      creationStartedRef.current ||
      workspacesLoading ||
      providersLoading ||
      creationError ||
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
        const message = toErrorMessage(error)
        creationStartedRef.current = false
        setCreationError(message)
        toast.error(message)
      })
  }, [
    createSession,
    navigate,
    params.threadId,
    provider,
    providersLoading,
    workspace,
    creationError,
    workspacesLoading
  ])

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

  async function changeModel(modelId: string): Promise<void> {
    if (!session || modelId === session.modelId) return
    try {
      const updated = await setAgentModel(session.id, session.provider, modelId)
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
    if (creationError) {
      return (
        <div className="grid h-full place-items-center p-8 text-center">
          <div className="max-w-md space-y-3">
            <p className="font-medium">Pi could not start</p>
            <p className="text-sm text-muted-foreground">{creationError}</p>
            <Button
              variant="outline"
              onClick={() => {
                creationStartedRef.current = false
                setCreationError(null)
              }}
            >
              Try again
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
          <Thread
            components={{
              ComposerControls: () => (
                <ThreadComposerControls
                  session={session}
                  provider={providers.find((item) => item.id === session.providerId) ?? null}
                  behavior={behavior}
                  onBehaviorChange={setBehavior}
                  onModelChange={(modelId) => void changeModel(modelId)}
                  onAccessChange={(full) => void toggleAccess(full)}
                />
              )
            }}
          />
        </PiThreadRuntimeProvider>
      </div>
    </section>
  )
}

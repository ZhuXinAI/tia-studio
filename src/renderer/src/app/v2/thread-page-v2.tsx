import { Bot, Check, ChevronDown, Circle, ListTodo, Shield, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  AgentInteractionRequest,
  AgentSendBehavior,
  AgentSessionSnapshot,
  AgentTodoItem
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
import { useAppV2Titlebar } from './app-v2-titlebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../components/ui/collapsible'
import type { ProviderRecord } from '../../features/settings/providers/providers-query'

function ThreadComposerControls({
  session,
  providers,
  behavior,
  onBehaviorChange,
  onModelChange,
  onAccessChange
}: {
  session: AgentSessionSnapshot
  providers: ProviderRecord[]
  behavior: AgentSendBehavior
  onBehaviorChange: (behavior: AgentSendBehavior) => void
  onModelChange: (provider: ProviderRecord, modelId: string) => void
  onAccessChange: (full: boolean) => void
}): React.JSX.Element {
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const activeProvider = enabledProviders.find((provider) => provider.id === session.providerId)
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
            <span className="truncate">
              {activeProvider?.name ?? session.provider} · {session.modelId}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-64">
          {enabledProviders.map((provider, providerIndex) => {
            const providerModels = provider.providerModels?.includes(provider.selectedModel)
              ? provider.providerModels
              : []
            const models = Array.from(
              new Set([provider.selectedModel, ...providerModels].filter(Boolean))
            )
            return (
              <div key={provider.id}>
                {providerIndex > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
                  {provider.name}
                </DropdownMenuLabel>
                {models.map((modelId) => (
                  <DropdownMenuItem
                    key={`${provider.id}/${modelId}`}
                    onSelect={() => onModelChange(provider, modelId)}
                  >
                    <span className="min-w-0 flex-1 truncate">{modelId}</span>
                    {provider.id === session.providerId && modelId === session.modelId ? (
                      <Check className="size-4" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </div>
            )
          })}
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

function ThreadTodoPanel({ todos }: { todos: AgentTodoItem[] }): React.JSX.Element | null {
  const [open, setOpen] = useState(true)
  if (todos.length === 0) return null
  const completed = todos.filter((todo) => todo.status === 'completed').length

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)]"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground">
        <ChevronDown className="size-4 transition-transform data-[state=closed]:-rotate-90" />
        <ListTodo className="size-4" />
        <span className="font-medium text-foreground">{todos.length} Todo</span>
        <span className="ml-auto text-xs tabular-nums">
          {completed}/{todos.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 border-t border-[color:var(--surface-border)] px-4 py-3">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-start gap-2.5 text-sm">
              {todo.status === 'completed' ? (
                <Check className="mt-0.5 size-4 text-muted-foreground" />
              ) : (
                <Circle
                  className={
                    todo.status === 'in_progress'
                      ? 'mt-0.5 size-4 fill-primary/20 text-primary'
                      : 'mt-0.5 size-4 text-muted-foreground'
                  }
                />
              )}
              <div className="min-w-0">
                <p
                  className={
                    todo.status === 'completed' ? 'text-muted-foreground line-through' : ''
                  }
                >
                  {todo.title}
                </p>
                {todo.detail ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{todo.detail}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  const location = useLocation()
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
  const modelReconciliationRef = useRef<string | null>(null)
  const rightRail = useAppV2ShellRightRail()
  const { setTitle: setTitlebarTitle } = useAppV2Titlebar()
  const isNewThreadRoute = location.pathname.endsWith('/new')

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
    setTitlebarTitle(session?.title ?? null)
    return () => setTitlebarTitle(null)
  }, [session?.title, setTitlebarTitle])

  useEffect(() => {
    if (params.threadId || !isNewThreadRoute) {
      creationStartedRef.current = false
      return
    }
    if (
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
    isNewThreadRoute,
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

  const changeModel = useCallback(
    async (nextProvider: ProviderRecord, modelId: string): Promise<void> => {
      if (!session || (nextProvider.id === session.providerId && modelId === session.modelId))
        return
      try {
        const updated = await setAgentModel(session.id, nextProvider.id, nextProvider.type, modelId)
        queryClient.setQueryData(agentSessionKeys.detail(session.id), updated)
        await queryClient.invalidateQueries({ queryKey: agentSessionKeys.all })
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [queryClient, session]
  )

  useEffect(() => {
    if (!session || session.status === 'running') return
    const currentProvider = providers.find((item) => item.id === session.providerId)
    if (!currentProvider) return
    const providerModels = currentProvider.providerModels?.includes(currentProvider.selectedModel)
      ? currentProvider.providerModels
      : []
    const configuredModels = new Set([currentProvider.selectedModel, ...providerModels])
    if (configuredModels.has(session.modelId)) {
      modelReconciliationRef.current = null
      return
    }
    const reconciliationKey = `${session.id}/${currentProvider.id}/${currentProvider.selectedModel}`
    if (modelReconciliationRef.current === reconciliationKey) return
    modelReconciliationRef.current = reconciliationKey
    void changeModel(currentProvider, currentProvider.selectedModel)
  }, [changeModel, providers, session])

  if (!params.threadId && !isNewThreadRoute) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium">No thread selected</p>
          <p className="text-sm text-muted-foreground">
            Choose a thread from the sidebar or use the plus button to start one.
          </p>
        </div>
      </div>
    )
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
              ComposerHeader: () => <ThreadTodoPanel todos={session.todos ?? []} />,
              ComposerControls: () => (
                <ThreadComposerControls
                  session={session}
                  providers={providers}
                  behavior={behavior}
                  onBehaviorChange={setBehavior}
                  onModelChange={(nextProvider, modelId) => void changeModel(nextProvider, modelId)}
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

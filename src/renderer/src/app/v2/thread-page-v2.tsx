import { Bot, Check, ChevronDown, Circle, Folder, ListTodo, Search, Shield, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  AgentInteractionRequest,
  AgentInteractionResponse,
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
import {
  NewPiThreadRuntimeProvider,
  PiThreadRuntimeProvider
} from '../../features/threads/components/pi-thread-runtime'
import { useProviders } from '../../features/settings/providers/providers-query'
import { useWorkspaces } from '../../features/workspaces/workspaces-query'
import type { WorkspaceRecord } from '../../features/workspaces/workspaces-query'
import { toErrorMessage } from '../../features/threads/thread-page-routing'
import { useAppV2ShellRightRail } from './app-v2-shell-right-rail'
import { useAppV2Titlebar } from './app-v2-titlebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../components/ui/collapsible'
import type { ProviderRecord } from '../../features/settings/providers/providers-query'
import { useTranslation } from '../../i18n/use-app-translation'

type ComposerSettings = Pick<
  AgentSessionSnapshot,
  'providerId' | 'provider' | 'modelId' | 'accessMode' | 'status'
>

function ThreadComposerControls({
  settings,
  providers,
  behavior,
  onBehaviorChange,
  onModelChange,
  onAccessChange
}: {
  settings: ComposerSettings
  providers: ProviderRecord[]
  behavior: AgentSendBehavior
  onBehaviorChange: (behavior: AgentSendBehavior) => void
  onModelChange: (provider: ProviderRecord, modelId: string) => void
  onAccessChange: (full: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const activeProvider = enabledProviders.find((provider) => provider.id === settings.providerId)
  const disabled = settings.status === 'running'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-44 gap-1.5 rounded-lg px-2 text-xs font-normal text-muted-foreground"
            aria-label={t('threads.composer.selectModel')}
            disabled={disabled}
          >
            <Bot className="size-3.5 shrink-0" />
            <span className="truncate">
              {activeProvider?.name ?? settings.provider} · {settings.modelId}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="max-h-[200px] w-64 overflow-y-auto"
        >
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
                    {provider.id === settings.providerId && modelId === settings.modelId ? (
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
            className={
              settings.accessMode === 'full'
                ? 'h-7 gap-1.5 rounded-lg bg-amber-900/30 px-2 text-xs font-medium text-amber-800 hover:bg-amber-900/40 dark:text-amber-200'
                : 'h-7 gap-1.5 rounded-lg px-2 text-xs font-normal text-muted-foreground'
            }
            aria-label={t('threads.composer.selectPermission')}
            disabled={disabled}
          >
            {settings.accessMode === 'full' ? (
              <ShieldCheck className="size-3.5" />
            ) : (
              <Shield className="size-3.5" />
            )}
            {settings.accessMode === 'full'
              ? t('threads.composer.fullAccess')
              : t('threads.composer.askPermission')}
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-52">
          <DropdownMenuItem onSelect={() => onAccessChange(false)}>
            <Shield className="mr-2 size-4" />
            <span className="flex-1">{t('threads.composer.askPermission')}</span>
            {settings.accessMode === 'standard' ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAccessChange(true)}>
            <ShieldCheck className="mr-2 size-4" />
            <span className="flex-1">{t('threads.composer.fullAccess')}</span>
            {settings.accessMode === 'full' ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          {settings.status === 'running' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('threads.composer.permissionLocked')}
              </DropdownMenuLabel>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {settings.status === 'running' ? (
        <select
          value={behavior}
          onChange={(event) => onBehaviorChange(event.target.value as AgentSendBehavior)}
          className="h-7 max-w-36 rounded-lg border-0 bg-transparent px-2 text-xs text-muted-foreground outline-none hover:bg-muted"
          aria-label={t('threads.composer.runningBehavior')}
        >
          <option value="steer">{t('threads.composer.steer')}</option>
          <option value="follow-up">{t('threads.composer.followUp')}</option>
        </select>
      ) : null}
    </>
  )
}

function DraftWorkspacePicker({
  selectedWorkspace,
  workspaces,
  onSelect
}: {
  selectedWorkspace: WorkspaceRecord
  workspaces: WorkspaceRecord[]
  onSelect: (workspaceId: string | null) => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const customWorkspaces = workspaces.filter((workspace) => workspace.builtInKind === null)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkspaces = customWorkspaces.filter(
    (workspace) =>
      !normalizedQuery ||
      workspace.name.toLowerCase().includes(normalizedQuery) ||
      workspace.rootPath.toLowerCase().includes(normalizedQuery)
  )

  if (customWorkspaces.length === 0) return null

  return (
    <div className="flex justify-center">
      <DropdownMenu onOpenChange={(open) => !open && setQuery('')}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 max-w-full gap-1.5 rounded-lg px-2.5 text-xs font-normal text-muted-foreground hover:bg-muted"
            aria-label={t('threads.sidebar.workspaces')}
          >
            <Folder className="size-3.5 shrink-0" />
            <span className="truncate">
              {selectedWorkspace.builtInKind === 'chats'
                ? t('threads.sidebar.chats')
                : selectedWorkspace.name}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-80 p-1.5">
          <div className="relative mb-1.5 px-1" onKeyDown={(event) => event.stopPropagation()}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('threads.sidebar.searchWorkspaces')}
              className="h-8 pl-7 text-xs"
              aria-label={t('threads.sidebar.searchWorkspaces')}
            />
          </div>
          <DropdownMenuItem onSelect={() => onSelect(null)}>
            <Folder className="mr-2 size-4 text-muted-foreground" />
            <span className="flex-1">{t('threads.sidebar.chats')}</span>
            {selectedWorkspace.builtInKind === 'chats' ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="max-h-48 overflow-y-auto">
            {filteredWorkspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.id} onSelect={() => onSelect(workspace.id)}>
                <Folder className="mr-2 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{workspace.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {workspace.rootPath}
                  </span>
                </span>
                {workspace.id === selectedWorkspace.id ? <Check className="ml-2 size-4" /> : null}
              </DropdownMenuItem>
            ))}
            {filteredWorkspaces.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                {t('threads.sidebar.noWorkspaces')}
              </p>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ThreadTodoPanel({ todos }: { todos: AgentTodoItem[] }): React.JSX.Element | null {
  const { t } = useTranslation()
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
        <span className="font-medium text-foreground">
          {t('threads.page.todo', { count: todos.length })}
        </span>
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
  const { t } = useTranslation()
  const [value, setValue] = useState(request.method === 'editor' ? (request.prefill ?? '') : '')
  const [isPending, setIsPending] = useState(false)

  async function respond(response: AgentInteractionResponse): Promise<void> {
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
        <p className="font-medium">
          {request.method === 'permission' ? t('threads.page.allowCommand') : request.title}
        </p>
        {request.method === 'confirm' || request.method === 'permission' ? (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {request.method === 'permission'
              ? t('threads.page.runCommand', { command: request.command })
              : request.message}
          </p>
        ) : null}
        {request.method === 'permission' && request.proposedPrefixes.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-muted-foreground">{t('threads.page.rememberedPrefix')}</p>
            {request.proposedPrefixes.map((prefix) => (
              <code key={prefix} className="bg-background block w-fit rounded px-1.5 py-0.5">
                {prefix}
              </code>
            ))}
          </div>
        ) : null}
        {request.method === 'permission' && !request.reusable ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('threads.page.onceOnly', { reason: request.nonReusableReason ?? '' })}
          </p>
        ) : null}
      </div>
      {request.method === 'permission' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, permissionOutcome: 'deny' })}
          >
            {t('threads.page.deny')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, permissionOutcome: 'allow-once' })}
          >
            {t('threads.page.allowOnce')}
          </Button>
          {request.reusable ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => void respond({ id: request.id, permissionOutcome: 'allow-session' })}
              >
                {t('threads.page.allowSession')}
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  void respond({ id: request.id, permissionOutcome: 'allow-workspace' })
                }
              >
                {t('threads.page.allowWorkspace')}
              </Button>
            </>
          ) : null}
        </>
      ) : request.method === 'confirm' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, confirmed: false })}
          >
            {t('threads.page.deny')}
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, confirmed: true })}
          >
            {t('threads.page.allowOnce')}
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
            {t('threads.page.submit')}
          </Button>
        </>
      )}
    </div>
  )
}

export function ThreadPageV2(): React.JSX.Element {
  const { t } = useTranslation()
  const params = useParams<{ workspaceId?: string; threadId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftWorkspaceId = searchParams.get('pwd')
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
  const [draftProviderId, setDraftProviderId] = useState<string | null>(null)
  const [draftModelId, setDraftModelId] = useState<string | null>(null)
  const [draftAccessMode, setDraftAccessMode] = useState<'standard' | 'full'>('standard')
  const modelReconciliationRef = useRef<string | null>(null)
  const rightRail = useAppV2ShellRightRail()
  const { setTitle: setTitlebarTitle } = useAppV2Titlebar()

  const workspace = useMemo(
    () => {
      const requestedWorkspace = draftWorkspaceId
        ? (workspaces.find(
            (item) => item.id === draftWorkspaceId && item.builtInKind === null
          ) ?? null)
        : null
      const legacyWorkspace = params.workspaceId
        ? (workspaces.find((item) => item.id === params.workspaceId) ?? null)
        : null
      return (
        requestedWorkspace ??
        legacyWorkspace ??
        workspaces.find((item) => item.builtInKind === 'chats') ??
        null
      )
    },
    [draftWorkspaceId, params.workspaceId, workspaces]
  )
  const provider = useMemo(
    () =>
      providers.find((item) => item.enabled && item.isDefault) ??
      providers.find((item) => item.enabled),
    [providers]
  )
  const draftProvider = useMemo(
    () => providers.find((item) => item.enabled && item.id === draftProviderId) ?? provider,
    [draftProviderId, provider, providers]
  )
  const draftModel = draftModelId ?? draftProvider?.selectedModel ?? ''

  useEffect(() => {
    if (!draftProvider) return
    if (draftProvider.id !== draftProviderId) {
      setDraftProviderId(draftProvider.id)
      setDraftModelId(draftProvider.selectedModel)
      return
    }
    const availableModels = new Set([
      draftProvider.selectedModel,
      ...(draftProvider.providerModels ?? [])
    ])
    if (!draftModelId || !availableModels.has(draftModelId)) {
      setDraftModelId(draftProvider.selectedModel)
    }
  }, [draftModelId, draftProvider, draftProviderId])

  useEffect(() => {
    rightRail.setHasContent(false)
  }, [rightRail])

  useEffect(() => {
    setTitlebarTitle(session?.title ?? null)
    return () => setTitlebarTitle(null)
  }, [session?.title, setTitlebarTitle])

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

  if (!params.threadId) {
    if (!providersLoading && !provider) {
      return (
        <div className="grid h-full place-items-center p-8 text-center">
          <div>
            <p className="font-medium">{t('threads.page.configureProvider')}</p>
            <Button asChild variant="link">
              <NavLink to="/settings/providers">{t('threads.page.openProviderSettings')}</NavLink>
            </Button>
          </div>
        </div>
      )
    }
    if (workspacesLoading || providersLoading || !workspace || !provider || !draftProvider) {
      return (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">
          {t('threads.page.loading')}
        </div>
      )
    }
    return (
      <NewPiThreadRuntimeProvider
        createSession={() =>
          createSession.mutateAsync({
            workspaceId: workspace.builtInKind === 'chats' ? null : workspace.id,
            workspacePath: workspace.rootPath,
            providerId: draftProvider.id,
            provider: draftProvider.type,
            modelId: draftModel,
            accessMode: draftAccessMode
          })
        }
        onCreated={(created) => navigate(sessionHref(created), { replace: true })}
        onError={(error) => toast.error(toErrorMessage(error))}
      >
        <Thread
          components={{
            ComposerHeader: () => (
              <DraftWorkspacePicker
                selectedWorkspace={workspace}
                workspaces={workspaces}
                onSelect={(workspaceId) => {
                  const nextSearch = workspaceId ? `?pwd=${encodeURIComponent(workspaceId)}` : ''
                  navigate(`/chat/new${nextSearch}`)
                }}
              />
            ),
            ComposerControls: () => (
              <ThreadComposerControls
                settings={{
                  providerId: draftProvider.id,
                  provider: draftProvider.type,
                  modelId: draftModel,
                  accessMode: draftAccessMode,
                  status: 'idle'
                }}
                providers={providers}
                behavior={behavior}
                onBehaviorChange={setBehavior}
                onModelChange={(nextProvider, modelId) => {
                  setDraftProviderId(nextProvider.id)
                  setDraftModelId(modelId)
                }}
                onAccessChange={(full) => setDraftAccessMode(full ? 'full' : 'standard')}
              />
            )
          }}
        />
      </NewPiThreadRuntimeProvider>
    )
  }

  if (sessionLoading || messagesLoading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        {t('threads.page.loading')}
      </div>
    )
  }

  if (!session || sessionError) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-destructive">
        {toErrorMessage(sessionError ?? new Error(t('threads.page.notFound')))}
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
                  settings={session}
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

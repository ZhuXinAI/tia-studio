import {
  Check,
  ChevronDown,
  Circle,
  Folder,
  ListTodo,
  Search,
  Shield,
  ShieldCheck
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  AgentSendBehavior,
  AgentSessionStatus,
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
  setAgentAccessMode,
  setAgentModel,
  setAgentThinkingLevel,
  useAgentMessages,
  useAgentSession,
  useCreateAgentSession
} from '../../features/threads/agent-sessions-query'
import {
  NewPiThreadRuntimeProvider,
  PiThreadRuntimeProvider
} from '../../features/threads/components/pi-thread-runtime'
import { ComposerMentions } from '../../features/threads/components/composer-mentions'
import { ThreadInteractionCard } from '../../features/threads/components/thread-interaction-card'
import { ThreadQueuePanel } from '../../features/threads/components/thread-queue-panel'
import { ModelSelector } from '../../components/assistant-ui/model-selector'
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
import { normalizeThinkingLevelForProvider } from '../../../../shared/thinking'

type ComposerSettings = Pick<
  AgentSessionSnapshot,
  'providerId' | 'provider' | 'modelId' | 'thinkingLevel' | 'accessMode' | 'status'
>

function resolveProviderThinkingLevel(
  provider: ProviderRecord,
  preferred?: AgentSessionSnapshot['thinkingLevel']
): AgentSessionSnapshot['thinkingLevel'] {
  return normalizeThinkingLevelForProvider({
    modelId: provider.selectedModel,
    supportsThinking: provider.supportsThinking,
    thinkingOnly: provider.thinkingOnly,
    allowsThinkingOff: provider.allowsThinkingOff,
    defaultThinkingLevel: provider.defaultThinkingLevel,
    supportedThinkingLevels: provider.supportedThinkingLevels,
    preferred
  })
}

function ThreadComposerControls({
  settings,
  providers,
  creating = false,
  onModelChange,
  onThinkingLevelChange,
  onAccessChange
}: {
  settings: ComposerSettings
  providers: ProviderRecord[]
  creating?: boolean
  onModelChange: (provider: ProviderRecord, modelId: string) => void
  onThinkingLevelChange: (level: AgentSessionSnapshot['thinkingLevel']) => void
  onAccessChange: (full: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const disabled = settings.status === 'running' || creating
  const modelOptions = enabledProviders.flatMap((provider) => {
    const providerModels = provider.providerModels?.includes(provider.selectedModel)
      ? provider.providerModels
      : []
    return Array.from(new Set([provider.selectedModel, ...providerModels].filter(Boolean))).map(
      (modelId) => ({
        id: `${provider.id}\u0000${modelId}`,
        name: modelId,
        group: provider.name,
        provider,
        modelId,
        thinking: {
          supportsThinking: provider.supportsThinking,
          thinkingOnly: provider.thinkingOnly,
          allowsThinkingOff: provider.allowsThinkingOff,
          defaultThinkingLevel: provider.defaultThinkingLevel,
          supportedThinkingLevels: provider.supportedThinkingLevels
        }
      })
    )
  })
  const selectedModelOptionId = `${settings.providerId}\u0000${settings.modelId}`

  return (
    <>
      <ModelSelector
        options={modelOptions}
        value={selectedModelOptionId}
        disabled={disabled}
        ariaLabel={t('threads.composer.selectModel')}
        onValueChange={(selectedId) => {
          const option = modelOptions.find((candidate) => candidate.id === selectedId)
          if (option) onModelChange(option.provider, option.modelId)
        }}
        thinkingLevel={settings.thinkingLevel}
        onThinkingLevelChange={(option, level) => {
          const candidate = modelOptions.find((item) => item.id === option.id)
          if (candidate) onModelChange(candidate.provider, candidate.modelId)
          onThinkingLevelChange(level)
        }}
      />

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
    </>
  )
}

function ThreadComposerBehavior({
  status,
  behavior,
  onBehaviorChange
}: {
  status: AgentSessionStatus
  behavior: AgentSendBehavior
  onBehaviorChange: (behavior: AgentSendBehavior) => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (status !== 'running') return null

  return (
    <div className="flex items-center justify-end gap-2 px-1">
      <span className="text-xs text-muted-foreground">{t('threads.composer.runningBehavior')}</span>
      <select
        value={behavior === 'steer' ? 'steer' : 'follow-up'}
        onChange={(event) => onBehaviorChange(event.target.value as AgentSendBehavior)}
        className="h-7 max-w-44 rounded-lg border border-border/60 bg-muted/35 px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('threads.composer.runningBehavior')}
      >
        <option value="follow-up">{t('threads.composer.followUp')}</option>
        <option value="steer">{t('threads.composer.steer')}</option>
      </select>
    </div>
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
    <div className="flex justify-start">
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

export function ThreadPageV2(): React.JSX.Element {
  const { t } = useTranslation()
  const params = useParams<{ workspaceId?: string; threadId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftWorkspaceId = searchParams.get('pwd')
  const initialComposerText = searchParams.get('prompt') ?? undefined
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
  const [behavior, setBehavior] = useState<AgentSendBehavior>('follow-up')
  const [draftProviderId, setDraftProviderId] = useState<string | null>(null)
  const [draftModelId, setDraftModelId] = useState<string | null>(null)
  const [draftThinkingLevel, setDraftThinkingLevel] =
    useState<AgentSessionSnapshot['thinkingLevel']>('medium')
  const [draftAccessMode, setDraftAccessMode] = useState<'standard' | 'full'>('standard')
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const modelReconciliationRef = useRef<string | null>(null)
  const rightRail = useAppV2ShellRightRail()
  const { setTitle: setTitlebarTitle } = useAppV2Titlebar()

  const workspace = useMemo(() => {
    const requestedWorkspace = draftWorkspaceId
      ? (workspaces.find((item) => item.id === draftWorkspaceId && item.builtInKind === null) ??
        null)
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
  }, [draftWorkspaceId, params.workspaceId, workspaces])
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
      setDraftThinkingLevel(resolveProviderThinkingLevel(draftProvider))
      return
    }
    const availableModels = new Set([
      draftProvider.selectedModel,
      ...(draftProvider.providerModels ?? [])
    ])
    if (!draftModelId || !availableModels.has(draftModelId)) {
      setDraftModelId(draftProvider.selectedModel)
    }
    setDraftThinkingLevel((current) => resolveProviderThinkingLevel(draftProvider, current))
  }, [draftModelId, draftProvider, draftProviderId])

  useEffect(() => {
    rightRail.setHasContent(false)
  }, [rightRail])

  useEffect(() => {
    setTitlebarTitle(session?.title ?? null)
    return () => setTitlebarTitle(null)
  }, [session?.title, setTitlebarTitle])

  useEffect(() => {
    if (session?.status !== 'running') setBehavior('follow-up')
  }, [session?.status])

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

  const changeThinkingLevel = useCallback(
    async (level: AgentSessionSnapshot['thinkingLevel']): Promise<void> => {
      if (!session || level === session.thinkingLevel) return
      try {
        const updated = await setAgentThinkingLevel(session.id, level)
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
            thinkingLevel: draftThinkingLevel,
            accessMode: draftAccessMode
          })
        }
        onCreatingChange={setIsCreatingThread}
        onCreated={(created) => navigate(sessionHref(created), { replace: true })}
        onError={(error) => toast.error(toErrorMessage(error))}
      >
        <Thread
          composerDisabled={isCreatingThread}
          composerInitialText={initialComposerText}
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
                  thinkingLevel: draftThinkingLevel,
                  accessMode: draftAccessMode,
                  status: 'idle'
                }}
                providers={providers}
                creating={isCreatingThread}
                onModelChange={(nextProvider, modelId) => {
                  setDraftProviderId(nextProvider.id)
                  setDraftModelId(modelId)
                  setDraftThinkingLevel((current) =>
                    resolveProviderThinkingLevel(nextProvider, current)
                  )
                }}
                onThinkingLevelChange={setDraftThinkingLevel}
                onAccessChange={(full) => setDraftAccessMode(full ? 'full' : 'standard')}
              />
            ),
            ComposerAddons: () => <ComposerMentions workspaceId={workspace.id} />
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
              ComposerHeader: () => (
                <>
                  <ThreadComposerBehavior
                    status={session.status}
                    behavior={behavior}
                    onBehaviorChange={setBehavior}
                  />
                  <ThreadTodoPanel todos={session.todos ?? []} />
                  <ThreadQueuePanel queue={session.queue} />
                  {session.pendingInteraction ? (
                    <ThreadInteractionCard
                      sessionId={session.id}
                      request={session.pendingInteraction}
                    />
                  ) : null}
                </>
              ),
              ComposerControls: () => (
                <ThreadComposerControls
                  settings={session}
                  providers={providers}
                  onModelChange={(nextProvider, modelId) => void changeModel(nextProvider, modelId)}
                  onThinkingLevelChange={(level) => void changeThinkingLevel(level)}
                  onAccessChange={(full) => void toggleAccess(full)}
                />
              ),
              ComposerAddons: () => (
                <ComposerMentions
                  workspaceId={
                    session.workspaceId ??
                    workspaces.find((item) => item.builtInKind === 'chats')?.id
                  }
                />
              )
            }}
          />
        </PiThreadRuntimeProvider>
      </div>
    </section>
  )
}

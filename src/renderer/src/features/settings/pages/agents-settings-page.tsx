import { Bot, FolderOpen, Plus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { queryClient } from '../../../lib/query-client'
import { cn } from '../../../lib/utils'
import {
  getAssistantCollectionTab,
  isBuiltInDefaultAssistant,
  type AssistantCollectionTab
} from '../../assistants/assistant-origin'
import {
  updateAssistantHeartbeat,
  type SaveAssistantHeartbeatInput
} from '../../assistants/assistant-heartbeat-query'
import {
  assistantKeys,
  updateAssistant,
  useAssistants,
  useCreateAssistant,
  useUpdateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../../assistants/assistants-query'
import { resolveDefaultAssistantWorkspacePath } from '../../assistants/default-workspace-path-query'
import {
  readAssistantWorkspaceRootPath,
  readAutoLocalAcpAgentCommand,
  readAutoLocalAcpAgentKey,
  syncInstalledLocalAcpAgents
} from '../../assistants/local-acp-assistant-sync'
import { AssistantManagementDialog } from '../../claws/components/assistant-management-dialog'
import {
  getMcpServersSettings,
  type McpServerRecord
} from '../mcp-servers/mcp-servers-query'
import { isModelProviderType } from '../providers/provider-type-options'
import {
  providerKeys,
  useProviders,
  type ProviderRecord
} from '../providers/providers-query'
import {
  listInstalledLocalAcpAgents,
  type InstalledLocalAcpAgentRecord
} from '../../threads/local-acp-agents-query'

type AgentsLocationState = {
  assistantDialog?: 'create'
  assistantTab?: AssistantCollectionTab
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    return message.length > 0 ? message : 'Unexpected request error'
  }

  return 'Unexpected request error'
}

function getProviderSummary(assistant: AssistantRecord, providers: ProviderRecord[]): string {
  const provider = providers.find((candidate) => candidate.id === assistant.providerId) ?? null
  if (!provider) {
    return 'No provider assigned'
  }

  return `${provider.name} · ${provider.selectedModel}`
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name))
}

function EmptyDetailState({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: React.JSX.Element | null
}): React.JSX.Element {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-2xl rounded-[1.5rem] border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[color:var(--surface-panel-soft)] text-muted-foreground">
            <Bot className="size-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{title}</h2>
            <p className="mx-auto max-w-xl text-sm leading-7 text-muted-foreground">
              {description}
            </p>
          </div>
          {action ?? null}
        </CardContent>
      </Card>
    </div>
  )
}

export function AgentsSettingsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: assistants = [], isLoading: isLoadingAssistants } = useAssistants()
  const { data: allProviders = [], isLoading: isLoadingProviders } = useProviders()
  const createAssistantMutation = useCreateAssistant()
  const updateAssistantMutation = useUpdateAssistant()
  const [activeTab, setActiveTab] = useState<AssistantCollectionTab>('acp')
  const [selectedAcpAssistantId, setSelectedAcpAssistantId] = useState<string | null>(null)
  const [selectedTiaAssistantId, setSelectedTiaAssistantId] = useState<string | null>(null)
  const [localAcpAgents, setLocalAcpAgents] = useState<InstalledLocalAcpAgentRecord[]>([])
  const [isLoadingLocalAcpAgents, setIsLoadingLocalAcpAgents] = useState(true)
  const [isSyncingLocalAcpAgents, setIsSyncingLocalAcpAgents] = useState(false)
  const [mcpServers, setMcpServers] = useState<Record<string, McpServerRecord>>({})
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [editingTiaAssistantId, setEditingTiaAssistantId] = useState<string | null>(null)
  const [isTiaDialogOpen, setIsTiaDialogOpen] = useState(false)
  const [acpWorkspaceDrafts, setAcpWorkspaceDrafts] = useState<Record<string, string>>({})
  const [savingAcpAssistantId, setSavingAcpAssistantId] = useState<string | null>(null)
  const modelProviders = useMemo(
    () => allProviders.filter((provider) => isModelProviderType(provider.type)),
    [allProviders]
  )

  useEffect(() => {
    void getMcpServersSettings()
      .then((result) => {
        setMcpServers(result.mcpServers)
      })
      .catch(() => {
        setMcpServers({})
      })
  }, [])

  useEffect(() => {
    let active = true
    setIsLoadingLocalAcpAgents(true)

    void listInstalledLocalAcpAgents()
      .then((nextAgents) => {
        if (active) {
          setLocalAcpAgents(nextAgents)
        }
      })
      .catch((error) => {
        if (active) {
          setLocalAcpAgents([])
          setPageError(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingLocalAcpAgents(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (isLoadingAssistants || isLoadingProviders || isLoadingLocalAcpAgents) {
      return
    }

    let active = true
    setIsSyncingLocalAcpAgents(true)

    void syncInstalledLocalAcpAgents({
      installedAgents: localAcpAgents,
      providers: allProviders,
      assistants
    })
      .then(async ({ assistants: nextAssistants, didMutate, providers: nextProviders }) => {
        if (!active || !didMutate) {
          return
        }

        queryClient.setQueryData(assistantKeys.lists(), nextAssistants)
        queryClient.setQueryData(providerKeys.lists(), nextProviders)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: assistantKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
        ])
      })
      .catch((error) => {
        if (active) {
          setPageError(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setIsSyncingLocalAcpAgents(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    allProviders,
    assistants,
    isLoadingAssistants,
    isLoadingLocalAcpAgents,
    isLoadingProviders,
    localAcpAgents
  ])

  const installedAcpAgentIndex = useMemo(
    () => new Map<string, number>(localAcpAgents.map((agent, index) => [agent.key, index])),
    [localAcpAgents]
  )
  const localAcpAgentsByKey = useMemo(
    () =>
      new Map<string, InstalledLocalAcpAgentRecord>(
        localAcpAgents.map((agent) => [agent.key, agent])
      ),
    [localAcpAgents]
  )

  const acpAssistants = useMemo(() => {
    return [...assistants]
      .filter((assistant) => getAssistantCollectionTab(assistant) === 'acp')
      .filter((assistant) => {
        const autoKey = readAutoLocalAcpAgentKey(assistant.workspaceConfig)
        return autoKey === null || installedAcpAgentIndex.has(autoKey)
      })
      .sort((left, right) => {
        const leftKey = readAutoLocalAcpAgentKey(left.workspaceConfig)
        const rightKey = readAutoLocalAcpAgentKey(right.workspaceConfig)
        const leftIndex =
          leftKey ? installedAcpAgentIndex.get(leftKey) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
        const rightIndex =
          rightKey
            ? installedAcpAgentIndex.get(rightKey) ?? Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER

        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex
        }

        return left.name.localeCompare(right.name)
      })
  }, [assistants, installedAcpAgentIndex])

  const tiaAssistants = useMemo(() => {
    return sortByName(
      assistants.filter(
        (assistant) =>
          getAssistantCollectionTab(assistant) === 'tia' && !isBuiltInDefaultAssistant(assistant)
      )
    )
  }, [assistants])

  useEffect(() => {
    setAcpWorkspaceDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      let didChange = false

      for (const assistant of acpAssistants) {
        if (nextDrafts[assistant.id] !== undefined) {
          continue
        }

        nextDrafts[assistant.id] = readAssistantWorkspaceRootPath(assistant.workspaceConfig) ?? ''
        didChange = true
      }

      for (const assistantId of Object.keys(nextDrafts)) {
        if (acpAssistants.some((assistant) => assistant.id === assistantId)) {
          continue
        }

        delete nextDrafts[assistantId]
        didChange = true
      }

      return didChange ? nextDrafts : currentDrafts
    })
  }, [acpAssistants])

  useEffect(() => {
    setSelectedAcpAssistantId((currentId) => {
      if (currentId && acpAssistants.some((assistant) => assistant.id === currentId)) {
        return currentId
      }

      return acpAssistants.at(0)?.id ?? null
    })
  }, [acpAssistants])

  useEffect(() => {
    setSelectedTiaAssistantId((currentId) => {
      if (currentId && tiaAssistants.some((assistant) => assistant.id === currentId)) {
        return currentId
      }

      return tiaAssistants.at(0)?.id ?? null
    })
  }, [tiaAssistants])

  const selectedAcpAssistant =
    selectedAcpAssistantId !== null
      ? acpAssistants.find((assistant) => assistant.id === selectedAcpAssistantId) ?? null
      : null
  const selectedTiaAssistant =
    selectedTiaAssistantId !== null
      ? tiaAssistants.find((assistant) => assistant.id === selectedTiaAssistantId) ?? null
      : null
  const editingTiaAssistant =
    editingTiaAssistantId !== null
      ? tiaAssistants.find((assistant) => assistant.id === editingTiaAssistantId) ?? null
      : null

  useEffect(() => {
    const nextState = location.state as AgentsLocationState | null
    if (!nextState) {
      return
    }

    if (nextState.assistantTab === 'tia' || nextState.assistantTab === 'acp') {
      setActiveTab(nextState.assistantTab)
    }

    if (nextState.assistantDialog === 'create') {
      setActiveTab('tia')
      setEditingTiaAssistantId(null)
      setDialogError(null)
      setIsTiaDialogOpen(true)
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const openTiaCreateDialog = (): void => {
    setActiveTab('tia')
    setEditingTiaAssistantId(null)
    setDialogError(null)
    setIsTiaDialogOpen(true)
  }

  const openTiaEditDialog = (assistantId: string): void => {
    setActiveTab('tia')
    setSelectedTiaAssistantId(assistantId)
    setEditingTiaAssistantId(assistantId)
    setDialogError(null)
    setIsTiaDialogOpen(true)
  }

  const closeTiaDialog = (): void => {
    if (createAssistantMutation.isPending || updateAssistantMutation.isPending) {
      return
    }

    setDialogError(null)
    setEditingTiaAssistantId(null)
    setIsTiaDialogOpen(false)
  }

  const handleTiaSubmit = async (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null
  ): Promise<void> => {
    setDialogError(null)

    try {
      const savedAssistant = editingTiaAssistant
        ? await updateAssistantMutation.mutateAsync({
            id: editingTiaAssistant.id,
            input
          })
        : await createAssistantMutation.mutateAsync(input)

      if (heartbeatInput) {
        await updateAssistantHeartbeat(savedAssistant.id, heartbeatInput)
      }

      toast.success(editingTiaAssistant ? 'TIA agent updated.' : 'TIA agent created.')
      closeTiaDialog()
    } catch (error) {
      setDialogError(toErrorMessage(error))
    }
  }

  const handleBrowseAcpWorkspace = async (assistantId: string): Promise<void> => {
    try {
      const selectedPath = await window.tiaDesktop.pickDirectory()
      if (selectedPath && selectedPath.trim().length > 0) {
        setAcpWorkspaceDrafts((current) => ({
          ...current,
          [assistantId]: selectedPath.trim()
        }))
      }
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const handleSaveAcpWorkspace = async (assistant: AssistantRecord): Promise<void> => {
    const requestedWorkspacePath = acpWorkspaceDrafts[assistant.id]?.trim() ?? ''
    const workspacePath =
      requestedWorkspacePath.length > 0
        ? requestedWorkspacePath
        : await resolveDefaultAssistantWorkspacePath(assistant.name)

    setSavingAcpAssistantId(assistant.id)

    try {
      const updatedAssistant = await updateAssistant(assistant.id, {
        workspaceConfig: {
          ...assistant.workspaceConfig,
          rootPath: workspacePath
        }
      })

      queryClient.setQueryData<AssistantRecord[] | undefined>(assistantKeys.lists(), (current) =>
        current?.map((candidate) =>
          candidate.id === updatedAssistant.id ? updatedAssistant : candidate
        )
      )
      await queryClient.invalidateQueries({ queryKey: assistantKeys.lists() })
      setAcpWorkspaceDrafts((current) => ({
        ...current,
        [assistant.id]: workspacePath
      }))
      toast.success('ACP workspace saved.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setSavingAcpAssistantId(null)
    }
  }

  const selectedAcpAutoKey = selectedAcpAssistant
    ? readAutoLocalAcpAgentKey(selectedAcpAssistant.workspaceConfig)
    : null
  const selectedDetectedAcpAgent = selectedAcpAutoKey
    ? localAcpAgentsByKey.get(selectedAcpAutoKey) ?? null
    : null
  const selectedAcpWorkspaceDraft = selectedAcpAssistant
    ? acpWorkspaceDrafts[selectedAcpAssistant.id] ?? ''
    : ''
  const selectedAcpResolvedCommand = selectedAcpAssistant
    ? (readAutoLocalAcpAgentCommand(selectedAcpAssistant.workspaceConfig) ??
      selectedDetectedAcpAgent?.resolvedCommand ??
      null)
    : null
  const isSavingSelectedAcpAssistant =
    selectedAcpAssistant !== null && savingAcpAssistantId === selectedAcpAssistant.id

  return (
    <>
      <div className="flex h-full min-h-0 flex-col" style={{ marginLeft: -32, marginRight: -32 }}>
        <div className="min-h-0 flex flex-1">
          <aside className="flex h-full min-h-0 w-[360px] flex-col overflow-hidden border-r border-r-border/70 bg-card shadow-xs">
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                  Agents
                </h2>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'acp'
                    ? 'Workspace-linked ACP agents'
                    : 'TIA-native assistant setup'}
                </p>
              </div>
              {activeTab === 'tia' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto shrink-0 px-0 text-base font-medium text-primary hover:bg-transparent hover:text-primary/80"
                  onClick={openTiaCreateDialog}
                >
                  + New
                </Button>
              ) : null}
            </div>

            <div className="space-y-3 border-b border-border/70 px-3 py-3">
              <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--surface-panel-soft)] p-1">
                {([
                  {
                    id: 'acp' as const,
                    count: acpAssistants.length,
                    label: 'ACP'
                  },
                  {
                    id: 'tia' as const,
                    count: tiaAssistants.length,
                    label: 'TIA'
                  }
                ] satisfies Array<{
                  id: AssistantCollectionTab
                  count: number
                  label: string
                }>).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                      activeTab === tab.id
                        ? 'bg-[color:var(--surface-panel)] text-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.45)]'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <span className="rounded-full bg-[color:var(--surface-panel-strong)] px-2 py-0.5 text-[11px]">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <p className="px-1 text-xs leading-5 text-muted-foreground">
                {activeTab === 'acp'
                  ? 'ACP agents only need a workspace before they can join a thread.'
                  : 'TIA agents keep the original onboarding and full studio editor.'}
              </p>
            </div>

            {pageError ? (
              <p className="border-b border-border/70 px-4 py-3 text-sm text-destructive" role="alert">
                {pageError}
              </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeTab === 'acp' ? (
                <>
                  {isLoadingLocalAcpAgents || isSyncingLocalAcpAgents ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Preparing ACP agents...</p>
                  ) : null}

                  {!isLoadingLocalAcpAgents && acpAssistants.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      No local ACP agents are available yet.
                    </p>
                  ) : null}

                  {acpAssistants.map((assistant, index) => {
                    const autoKey = readAutoLocalAcpAgentKey(assistant.workspaceConfig)
                    const detectedAgent = autoKey ? localAcpAgentsByKey.get(autoKey) ?? null : null
                    const isSelected = assistant.id === selectedAcpAssistantId
                    const workspaceLabel =
                      readAssistantWorkspaceRootPath(assistant.workspaceConfig) ??
                      'Auto-generate in TIA workspace'

                    return (
                      <button
                        key={assistant.id}
                        type="button"
                        data-agent-row={assistant.id}
                        className={cn(
                          'group flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
                          index > 0 ? 'border-t border-border/60' : '',
                          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
                        )}
                        onClick={() => setSelectedAcpAssistantId(assistant.id)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">{assistant.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {detectedAgent?.resolvedCommand ?? 'Detected locally'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{workspaceLabel}</p>
                        </div>
                        <span className="mt-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          ACP
                        </span>
                      </button>
                    )
                  })}
                </>
              ) : (
                <>
                  {tiaAssistants.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      No TIA agents yet. Create one to use the original onboarding flow.
                    </p>
                  ) : null}

                  {tiaAssistants.map((assistant, index) => {
                    const isSelected = assistant.id === selectedTiaAssistantId

                    return (
                      <button
                        key={assistant.id}
                        type="button"
                        data-agent-row={assistant.id}
                        className={cn(
                          'group flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
                          index > 0 ? 'border-t border-border/60' : '',
                          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
                        )}
                        onClick={() => setSelectedTiaAssistantId(assistant.id)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">{assistant.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {getProviderSummary(assistant, modelProviders)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {readAssistantWorkspaceRootPath(assistant.workspaceConfig) ??
                              'No workspace configured'}
                          </p>
                        </div>
                        <span className="mt-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          TIA
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </aside>

          <Card className="flex h-full min-h-0 flex-1 flex-col rounded-none border-none bg-card/85 shadow-xs">
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-6">
              {activeTab === 'acp' ? (
                selectedAcpAssistant ? (
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                        ACP Agent
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                          {selectedAcpAssistant.name}
                        </h1>
                        <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          ACP
                        </span>
                      </div>
                      <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                        Keep ACP agents lightweight here. Pick a workspace and they can chime in
                        without exposing TIA-only Coding or MCP configuration.
                      </p>
                    </div>

                    <Card className="rounded-[1.5rem] border-[color:var(--surface-border)] bg-[color:var(--surface-panel)]">
                      <CardHeader>
                        <CardTitle className="text-base">Workspace assignment</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="space-y-2">
                          <label
                            htmlFor={`acp-workspace-${selectedAcpAssistant.id}`}
                            className="text-sm font-medium"
                          >
                            Workspace
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              id={`acp-workspace-${selectedAcpAssistant.id}`}
                              value={selectedAcpWorkspaceDraft}
                              placeholder="Auto-generate in TIA workspace"
                              onChange={(event) =>
                                setAcpWorkspaceDrafts((current) => ({
                                  ...current,
                                  [selectedAcpAssistant.id]: event.target.value
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isSavingSelectedAcpAssistant}
                              onClick={() => void handleBrowseAcpWorkspace(selectedAcpAssistant.id)}
                            >
                              <FolderOpen className="size-4" />
                              Browse
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {readAssistantWorkspaceRootPath(selectedAcpAssistant.workspaceConfig) ??
                              'TIA will generate a workspace path when you save.'}
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-2xl bg-[color:var(--surface-panel-soft)] p-4">
                            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              Detected command
                            </p>
                            <p className="mt-2 break-all text-sm text-foreground">
                              {selectedAcpResolvedCommand ?? 'Detected locally'}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[color:var(--surface-panel-soft)] p-4">
                            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              Binary path
                            </p>
                            <p className="mt-2 break-all text-sm text-foreground">
                              {selectedDetectedAcpAgent?.binaryPath ?? 'Local ACP binary'}
                            </p>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            disabled={isSavingSelectedAcpAssistant}
                            onClick={() => void handleSaveAcpWorkspace(selectedAcpAssistant)}
                          >
                            {isSavingSelectedAcpAssistant ? 'Saving...' : 'Save Workspace'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <EmptyDetailState
                    title="No ACP agents detected"
                    description="Install a local ACP agent and it will appear here automatically. Once it shows up, you only need to assign a workspace."
                  />
                )
              ) : selectedTiaAssistant ? (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                      TIA Agent
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                        {selectedTiaAssistant.name}
                      </h1>
                      <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        TIA
                      </span>
                    </div>
                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                      {selectedTiaAssistant.description.trim().length > 0
                        ? selectedTiaAssistant.description
                        : 'TIA agents keep the original onboarding and full native studio configuration.'}
                    </p>
                  </div>

                  <Card className="rounded-[1.5rem] border-[color:var(--surface-border)] bg-[color:var(--surface-panel)]">
                    <CardHeader>
                      <CardTitle className="text-base">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-[color:var(--surface-panel-soft)] p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Provider
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {getProviderSummary(selectedTiaAssistant, modelProviders)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[color:var(--surface-panel-soft)] p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Workspace
                        </p>
                        <p className="mt-2 break-all text-sm text-foreground">
                          {readAssistantWorkspaceRootPath(selectedTiaAssistant.workspaceConfig) ??
                            'No workspace configured'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[color:var(--surface-panel-soft)] p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Max steps
                        </p>
                        <p className="mt-2 text-sm text-foreground">{selectedTiaAssistant.maxSteps}</p>
                      </div>
                      <div className="rounded-2xl bg-[color:var(--surface-panel-soft)] p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Status
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {selectedTiaAssistant.enabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      className="rounded-full px-5"
                      onClick={() => navigate(`/agents/${selectedTiaAssistant.id}`)}
                    >
                      Open Chat
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full px-5"
                      onClick={() => openTiaEditDialog(selectedTiaAssistant.id)}
                    >
                      <Sparkles className="size-4" />
                      Edit TIA Agent
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full px-5"
                      onClick={openTiaCreateDialog}
                    >
                      <Plus className="size-4" />
                      Create TIA Agent
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyDetailState
                  title="No TIA agents yet"
                  description="Create a TIA agent to use the original onboarding flow and full native studio configuration."
                  action={
                    <Button type="button" className="rounded-full px-5" onClick={openTiaCreateDialog}>
                      <Plus className="size-4" />
                      Create TIA Agent
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AssistantManagementDialog
        mode={editingTiaAssistant ? 'edit' : 'create'}
        isOpen={isTiaDialogOpen}
        assistant={editingTiaAssistant}
        providers={modelProviders}
        mcpServers={mcpServers}
        initialCreatePath="tia"
        isSaving={createAssistantMutation.isPending || updateAssistantMutation.isPending}
        errorMessage={dialogError}
        onClose={closeTiaDialog}
        onSelectWorkspacePath={() => window.tiaDesktop.pickDirectory()}
        onSubmit={handleTiaSubmit}
      />
    </>
  )
}

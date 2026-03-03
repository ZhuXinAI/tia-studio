import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Plus, Trash2, X } from 'lucide-react'
import { AssistantEditor } from '../assistant-editor'
import {
  createAssistant,
  deleteAssistant,
  listAssistants,
  updateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../assistants-query'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'
import {
  getMcpServersSettings,
  type McpServerRecord
} from '../../settings/mcp-servers/mcp-servers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'

type ToastState = {
  kind: 'success' | 'error'
  message: string
}

const assistantsLoadHint = 'Unable to load assistants yet. You can still create a new one.'
const providersLoadHint = 'Unable to load providers right now.'
const mcpServersLoadHint = 'Unable to load MCP servers right now.'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length === 0) {
      return 'Unexpected request error'
    }

    if (message.toLowerCase() === 'failed to fetch') {
      return 'Unable to reach the local service. Please restart the app and try again.'
    }

    try {
      const parsed = JSON.parse(message) as { error?: unknown }
      if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
        return parsed.error
      }
    } catch {
      // keep original message
    }

    return message
  }

  return 'Unexpected request error'
}

function getAssistantThreadsPath(assistantId: string): string {
  return `/assistants/${assistantId}/threads`
}

export function AssistantsPage(): React.JSX.Element {
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingAssistants, setIsLoadingAssistants] = useState(true)
  const [isLoadingProviders, setIsLoadingProviders] = useState(true)
  const [isLoadingMcpServers, setIsLoadingMcpServers] = useState(true)
  const [mcpServers, setMcpServers] = useState<Record<string, McpServerRecord>>({})
  const [libraryLoadMessage, setLibraryLoadMessage] = useState<string | null>(null)
  const [createDialogError, setCreateDialogError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const selectedAssistant = useMemo(() => {
    if (!selectedAssistantId) {
      return null
    }

    return assistants.find((assistant) => assistant.id === selectedAssistantId) ?? null
  }, [assistants, selectedAssistantId])

  const refreshData = useCallback(async () => {
    setIsLoading(true)
    setIsLoadingAssistants(true)
    setIsLoadingProviders(true)
    setIsLoadingMcpServers(true)
    setLibraryLoadMessage(null)
    try {
      const [assistantsResult, providersResult, mcpServersResult] = await Promise.allSettled([
        listAssistants(),
        listProviders(),
        getMcpServersSettings()
      ])

      if (providersResult.status === 'fulfilled') {
        setProviders(providersResult.value)
        setIsLoadingProviders(false)
      } else {
        setProviders([])
        setIsLoadingProviders(false)
        setLibraryLoadMessage(providersLoadHint)
      }

      if (assistantsResult.status === 'fulfilled') {
        const nextAssistants = assistantsResult.value
        setAssistants(nextAssistants)
        setIsLoadingAssistants(false)
        setSelectedAssistantId((currentId) => {
          if (currentId && nextAssistants.some((assistant) => assistant.id === currentId)) {
            return currentId
          }
          return nextAssistants.at(0)?.id ?? null
        })
      } else {
        setAssistants([])
        setIsLoadingAssistants(false)
        setSelectedAssistantId(null)
        setLibraryLoadMessage(assistantsLoadHint)
      }

      if (mcpServersResult.status === 'fulfilled') {
        setMcpServers(mcpServersResult.value.mcpServers)
        setIsLoadingMcpServers(false)
      } else {
        setMcpServers({})
        setIsLoadingMcpServers(false)
        setLibraryLoadMessage((current) => current ?? mcpServersLoadHint)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshProvidersForCreateDialog = useCallback(async () => {
    setIsLoadingProviders(true)
    setIsLoadingMcpServers(true)
    try {
      const [nextProviders, mcpSettings] = await Promise.all([
        listProviders(),
        getMcpServersSettings()
      ])
      setProviders(nextProviders)
      setMcpServers(mcpSettings.mcpServers)
      setLibraryLoadMessage((current) => (current === providersLoadHint ? null : current))
    } catch {
      setLibraryLoadMessage((current) => current ?? providersLoadHint)
    } finally {
      setIsLoadingProviders(false)
      setIsLoadingMcpServers(false)
    }
  }, [])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        setIsCreateDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isCreateDialogOpen, isSubmitting])

  const handleCreateAssistant = async (input: SaveAssistantInput) => {
    setIsSubmitting(true)
    setCreateDialogError(null)
    setToast(null)
    try {
      const createdAssistant = await createAssistant(input)
      setAssistants((currentAssistants) => [createdAssistant, ...currentAssistants])
      setSelectedAssistantId(createdAssistant.id)
      setIsCreateDialogOpen(false)
      setToast({ kind: 'success', message: 'Assistant created.' })
    } catch (error) {
      setCreateDialogError(toErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateAssistant = async (input: SaveAssistantInput) => {
    if (!selectedAssistant) {
      return
    }

    setIsSubmitting(true)
    setToast(null)
    try {
      const updatedAssistant = await updateAssistant(selectedAssistant.id, input)
      setAssistants((currentAssistants) =>
        currentAssistants.map((assistant) =>
          assistant.id === updatedAssistant.id ? updatedAssistant : assistant
        )
      )
      setToast({ kind: 'success', message: 'Assistant updated.' })
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAssistant = async (assistant: AssistantRecord) => {
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setToast(null)

    try {
      await deleteAssistant(assistant.id)
      setAssistants((currentAssistants) => {
        const nextAssistants = currentAssistants.filter((item) => item.id !== assistant.id)
        if (selectedAssistantId === assistant.id) {
          setSelectedAssistantId(nextAssistants.at(0)?.id ?? null)
        }
        return nextAssistants
      })
      setToast({ kind: 'success', message: 'Assistant deleted.' })
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeCreateDialog = () => {
    if (!isSubmitting) {
      setIsCreateDialogOpen(false)
      setCreateDialogError(null)
    }
  }

  const selectWorkspacePath = useCallback(async (): Promise<string | null> => {
    if (typeof window === 'undefined') {
      return null
    }

    const picker = window.tiaDesktop?.pickDirectory
    if (typeof picker !== 'function') {
      return null
    }

    return picker()
  }, [])

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Assistants</h1>
          <p className="text-muted-foreground text-sm">
            Create and configure assistants before starting threads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedAssistant ? (
            <Button asChild variant="secondary">
              <Link to={getAssistantThreadsPath(selectedAssistant.id)}>Open Chat</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              setIsCreateDialogOpen(true)
              setCreateDialogError(null)
              setToast(null)
              void refreshProvidersForCreateDialog()
            }}
          >
            <Plus className="size-4" />
            New Assistant
          </Button>
        </div>
      </header>

      {toast ? (
        <p
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            toast.kind === 'error'
              ? 'border-destructive/70 text-destructive'
              : 'border-emerald-400/70 text-emerald-300'
          )}
        >
          {toast.message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Library</CardTitle>
            <CardDescription>Pick an assistant to edit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingAssistants || isLoadingProviders || isLoadingMcpServers ? (
              <p className="text-muted-foreground text-sm">Loading assistants...</p>
            ) : null}
            {libraryLoadMessage ? (
              <p role="status" className="text-muted-foreground text-sm">
                {libraryLoadMessage}
              </p>
            ) : null}
            {!isLoading && assistants.length === 0 ? (
              <p className="text-muted-foreground text-sm">No assistants yet. Click New Assistant.</p>
            ) : null}

            <div className="space-y-2">
              {assistants.map((assistant) => {
                const isActive = assistant.id === selectedAssistantId
                return (
                  <div
                    key={assistant.id}
                    className={cn(
                      'flex items-center gap-1 rounded-md border pl-3 pr-1 py-1.5 transition-colors',
                      isActive
                        ? 'border-primary/80 bg-primary/10'
                        : 'border-border/70 bg-card/60 hover:bg-accent/30'
                    )}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => {
                        setSelectedAssistantId(assistant.id)
                        setToast(null)
                      }}
                    >
                      <p className="font-medium">{assistant.name}</p>
                      <p className="text-muted-foreground text-xs">{assistant.providerId}</p>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Delete assistant ${assistant.name}`}
                      onClick={() => void handleDeleteAssistant(assistant)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{selectedAssistant ? 'Assistant Editor' : 'Assistant Setup'}</CardTitle>
            <CardDescription>Workspace path and provider are required before chat.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedAssistant ? (
              <p className="text-muted-foreground text-sm">
                Pick an assistant from the library or create one with New Assistant.
              </p>
            ) : (
              <div className="space-y-3">
                {providers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    <Bot className="mr-1 inline size-4" />
                    Add a provider first in <Link to="/settings/providers">Model Provider</Link>.
                  </p>
                ) : null}
                <AssistantEditor
                  key={selectedAssistant.id}
                  providers={providers}
                  mcpServers={mcpServers}
                  initialValue={selectedAssistant}
                  isSubmitting={isSubmitting}
                  onSelectWorkspacePath={selectWorkspacePath}
                  onSubmit={handleUpdateAssistant}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isCreateDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close create assistant dialog"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={closeCreateDialog}
            disabled={isSubmitting}
          />
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-assistant-title"
            className="relative z-10 w-full max-w-4xl gap-4 py-5"
          >
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle id="create-assistant-title">Create Assistant</CardTitle>
                  <CardDescription>
                    Configure workspace path and provider before starting chat.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeCreateDialog}
                  disabled={isSubmitting}
                  aria-label="Close dialog"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {providers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    <Bot className="mr-1 inline size-4" />
                    Add a provider first in <Link to="/settings/providers">Model Provider</Link>.
                  </p>
                ) : null}
                {createDialogError ? (
                  <p role="alert" className="text-destructive text-sm">
                    {createDialogError}
                  </p>
                ) : null}
                <AssistantEditor
                  key="new-assistant"
                  providers={providers}
                  mcpServers={mcpServers}
                  initialValue={null}
                  isSubmitting={isSubmitting}
                  onSelectWorkspacePath={selectWorkspacePath}
                  onSubmit={handleCreateAssistant}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  )
}

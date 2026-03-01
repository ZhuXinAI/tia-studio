import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Plus } from 'lucide-react'
import { AssistantEditor } from '../assistant-editor'
import {
  createAssistant,
  listAssistants,
  updateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../assistants-query'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'

type ToastState = {
  kind: 'success' | 'error'
  message: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected request error'
}

export function AssistantsPage(): React.JSX.Element {
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null)
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const selectedAssistant = useMemo(() => {
    if (!selectedAssistantId) {
      return null
    }

    return assistants.find((assistant) => assistant.id === selectedAssistantId) ?? null
  }, [assistants, selectedAssistantId])

  const refreshData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextAssistants, nextProviders] = await Promise.all([listAssistants(), listProviders()])
      setAssistants(nextAssistants)
      setProviders(nextProviders)
      setSelectedAssistantId((currentId) => {
        if (currentId && nextAssistants.some((assistant) => assistant.id === currentId)) {
          return currentId
        }
        return nextAssistants.at(0)?.id ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  const handleSubmitAssistant = async (input: SaveAssistantInput) => {
    setIsSubmitting(true)
    setToast(null)
    try {
      if (isCreatingAssistant || !selectedAssistant) {
        const createdAssistant = await createAssistant(input)
        setAssistants((currentAssistants) => [createdAssistant, ...currentAssistants])
        setSelectedAssistantId(createdAssistant.id)
        setIsCreatingAssistant(false)
        setToast({ kind: 'success', message: 'Assistant created.' })
      } else {
        const updatedAssistant = await updateAssistant(selectedAssistant.id, input)
        setAssistants((currentAssistants) =>
          currentAssistants.map((assistant) =>
            assistant.id === updatedAssistant.id ? updatedAssistant : assistant
          )
        )
        setToast({ kind: 'success', message: 'Assistant updated.' })
      }
    } catch (error) {
      setToast({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Assistants</h1>
          <p className="text-muted-foreground text-sm">
            Create and configure assistants before starting threads.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setIsCreatingAssistant(true)
            setToast(null)
          }}
        >
          <Plus className="size-4" />
          New Assistant
        </Button>
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
            {isLoading ? <p className="text-muted-foreground text-sm">Loading assistants...</p> : null}
            {!isLoading && assistants.length === 0 ? (
              <p className="text-muted-foreground text-sm">No assistants yet. Click New Assistant.</p>
            ) : null}

            <div className="space-y-2">
              {assistants.map((assistant) => {
                const isActive = assistant.id === selectedAssistantId && !isCreatingAssistant
                return (
                  <button
                    key={assistant.id}
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      isActive
                        ? 'border-primary/80 bg-primary/10'
                        : 'border-border/70 bg-card/60 hover:bg-accent/30'
                    )}
                    onClick={() => {
                      setSelectedAssistantId(assistant.id)
                      setIsCreatingAssistant(false)
                      setToast(null)
                    }}
                  >
                    <p className="font-medium">{assistant.name}</p>
                    <p className="text-muted-foreground text-xs">{assistant.providerId}</p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{isCreatingAssistant ? 'Create Assistant' : 'Assistant Editor'}</CardTitle>
            <CardDescription>Workspace path and provider are required before chat.</CardDescription>
          </CardHeader>
          <CardContent>
            {providers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Bot className="mr-1 inline size-4" />
                Add a provider first in <Link to="/settings/providers">Model Provider</Link>.
              </p>
            ) : (
              <AssistantEditor
                key={isCreatingAssistant ? 'new-assistant' : selectedAssistant?.id ?? 'empty-assistant'}
                providers={providers}
                initialValue={isCreatingAssistant ? null : selectedAssistant}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmitAssistant}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

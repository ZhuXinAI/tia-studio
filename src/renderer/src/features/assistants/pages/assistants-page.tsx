import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssistantEditor } from '../assistant-editor'
import {
  createAssistant,
  listAssistants,
  updateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../assistants-query'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'

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
    <section className="assistants-page">
      <header className="assistants-page__header">
        <div>
          <h1>Assistants</h1>
          <p>Create and configure assistants before starting threads.</p>
        </div>
        <button
          type="button"
          className="ui-button ui-button--primary"
          onClick={() => {
            setIsCreatingAssistant(true)
            setToast(null)
          }}
        >
          New Assistant
        </button>
      </header>

      {toast ? (
        <p
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`ui-toast ${toast.kind === 'error' ? 'ui-toast--error' : 'ui-toast--success'}`}
        >
          {toast.message}
        </p>
      ) : null}

      <div className="assistants-page__grid">
        <aside className="ui-card assistants-list">
          <h2>Library</h2>
          {isLoading ? <p className="ui-muted">Loading assistants...</p> : null}
          {!isLoading && assistants.length === 0 ? (
            <p className="ui-muted">No assistants yet. Click New Assistant.</p>
          ) : null}

          <div className="assistants-list__items">
            {assistants.map((assistant) => {
              const isActive = assistant.id === selectedAssistantId && !isCreatingAssistant
              return (
                <button
                  key={assistant.id}
                  type="button"
                  className={`assistants-list__item ${isActive ? 'assistants-list__item--active' : ''}`}
                  onClick={() => {
                    setSelectedAssistantId(assistant.id)
                    setIsCreatingAssistant(false)
                    setToast(null)
                  }}
                >
                  <span className="assistants-list__name">{assistant.name}</span>
                  <span className="assistants-list__meta">{assistant.providerId}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="ui-card assistants-editor">
          <h2>{isCreatingAssistant ? 'Create Assistant' : 'Assistant Editor'}</h2>
          {providers.length === 0 ? (
            <p className="ui-muted">
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
        </section>
      </div>
    </section>
  )
}

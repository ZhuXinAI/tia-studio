import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createAssistant,
  listAssistants,
  updateAssistant,
  type AssistantRecord,
  type SaveAssistantInput
} from '../../assistants/assistants-query'
import { AssistantEditor } from '../../assistants/assistant-editor'
import { listProviders, type ProviderRecord } from '../../settings/providers/providers-query'
import { createThread, getActiveResourceId, listThreads, type ThreadRecord } from '../threads-query'

type ReadinessCheckId = 'workspace' | 'provider' | 'model'

type ReadinessCheck = {
  id: ReadinessCheckId
  label: string
  ready: boolean
  ctaPath: string
}

export type AssistantReadiness = {
  canChat: boolean
  checks: ReadinessCheck[]
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected request error'
}

function hasWorkspaceRootPath(assistant: AssistantRecord | null): boolean {
  if (!assistant) {
    return false
  }

  const rootPath =
    typeof assistant.workspaceConfig.rootPath === 'string' ? assistant.workspaceConfig.rootPath : ''
  return rootPath.trim().length > 0
}

export function evaluateAssistantReadiness(input: {
  assistant: AssistantRecord | null
  providers: ProviderRecord[]
}): AssistantReadiness {
  const workspaceReady = hasWorkspaceRootPath(input.assistant)
  const provider =
    input.assistant && input.assistant.providerId.trim().length > 0
      ? input.providers.find((item) => item.id === input.assistant?.providerId) ?? null
      : null
  const providerReady = Boolean(provider)
  const modelReady = Boolean(provider?.selectedModel.trim().length)

  const checks: ReadinessCheck[] = [
    {
      id: 'workspace',
      label: 'Workspace path configured',
      ready: workspaceReady,
      ctaPath: '/assistants'
    },
    {
      id: 'provider',
      label: 'Provider is assigned to this assistant',
      ready: providerReady,
      ctaPath: '/assistants'
    },
    {
      id: 'model',
      label: 'Provider has one selected model',
      ready: modelReady,
      ctaPath: '/assistants'
    }
  ]

  return {
    canChat: checks.every((check) => check.ready),
    checks
  }
}

function createThreadTitle(existingThreads: ThreadRecord[]): string {
  return existingThreads.length === 0 ? 'New Thread' : `New Thread ${existingThreads.length + 1}`
}

function routeToAssistantThreads(assistantId: string, threadId?: string): string {
  if (threadId) {
    return `/assistants/${assistantId}/threads/${threadId}`
  }

  return `/assistants/${assistantId}/threads`
}

export function ThreadPage(): React.JSX.Element {
  const params = useParams()
  const navigate = useNavigate()
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isSavingAssistant, setIsSavingAssistant] = useState(false)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'success' | 'error'>('success')
  const [loadError, setLoadError] = useState<string | null>(null)

  const selectedAssistant = useMemo(() => {
    const assistantId = params.assistantId
    if (!assistantId) {
      return null
    }

    return assistants.find((assistant) => assistant.id === assistantId) ?? null
  }, [assistants, params.assistantId])

  const selectedThread = useMemo(() => {
    if (!params.threadId) {
      return null
    }

    return threads.find((thread) => thread.id === params.threadId) ?? null
  }, [params.threadId, threads])

  const readiness = useMemo(() => {
    return evaluateAssistantReadiness({
      assistant: selectedAssistant,
      providers
    })
  }, [providers, selectedAssistant])

  const loadAssistantsAndProviders = useCallback(async () => {
    setIsLoadingData(true)
    setLoadError(null)
    try {
      const [nextAssistants, nextProviders] = await Promise.all([listAssistants(), listProviders()])
      setAssistants(nextAssistants)
      setProviders(nextProviders)
    } catch (error) {
      setLoadError(toErrorMessage(error))
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    void loadAssistantsAndProviders()
  }, [loadAssistantsAndProviders])

  useEffect(() => {
    if (isLoadingData) {
      return
    }

    if (!params.assistantId && assistants.length > 0) {
      navigate(routeToAssistantThreads(assistants[0].id), { replace: true })
    } else if (
      params.assistantId &&
      !assistants.some((assistant) => assistant.id === params.assistantId) &&
      assistants.length > 0
    ) {
      navigate(routeToAssistantThreads(assistants[0].id), { replace: true })
    }
  }, [assistants, isLoadingData, navigate, params.assistantId])

  useEffect(() => {
    if (!selectedAssistant) {
      setThreads([])
      return
    }

    let active = true
    setIsLoadingThreads(true)
    setLoadError(null)

    void listThreads(selectedAssistant.id)
      .then((nextThreads) => {
        if (active) {
          setThreads(nextThreads)
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingThreads(false)
        }
      })

    return () => {
      active = false
    }
  }, [selectedAssistant])

  const handleSelectAssistant = (assistantId: string) => {
    setStatusMessage(null)
    setIsCreatingAssistant(false)
    navigate(routeToAssistantThreads(assistantId))
  }

  const handleCreateThread = async () => {
    if (!selectedAssistant) {
      return
    }

    setStatusMessage(null)
    setIsCreatingThread(true)
    try {
      const createdThread = await createThread({
        assistantId: selectedAssistant.id,
        resourceId: getActiveResourceId(),
        title: createThreadTitle(threads)
      })
      setThreads((currentThreads) => [createdThread, ...currentThreads])
      navigate(routeToAssistantThreads(selectedAssistant.id, createdThread.id))
      setStatusKind('success')
      setStatusMessage('Thread created.')
    } catch (error) {
      setStatusKind('error')
      setStatusMessage(toErrorMessage(error))
    } finally {
      setIsCreatingThread(false)
    }
  }

  const handleSubmitAssistant = async (input: SaveAssistantInput) => {
    setStatusMessage(null)
    setIsSavingAssistant(true)

    try {
      if (!selectedAssistant || isCreatingAssistant) {
        const createdAssistant = await createAssistant(input)
        setAssistants((currentAssistants) => [createdAssistant, ...currentAssistants])
        setIsCreatingAssistant(false)
        navigate(routeToAssistantThreads(createdAssistant.id))
        setStatusKind('success')
        setStatusMessage('Assistant created.')
      } else {
        const updatedAssistant = await updateAssistant(selectedAssistant.id, input)
        setAssistants((currentAssistants) =>
          currentAssistants.map((assistant) =>
            assistant.id === updatedAssistant.id ? updatedAssistant : assistant
          )
        )
        setStatusKind('success')
        setStatusMessage('Assistant updated.')
      }
    } catch (error) {
      setStatusKind('error')
      setStatusMessage(toErrorMessage(error))
    } finally {
      setIsSavingAssistant(false)
    }
  }

  const showAssistantEditor = isCreatingAssistant || Boolean(selectedAssistant)

  return (
    <section style={{ display: 'grid', gap: '16px' }}>
      <h1 style={{ margin: 0 }}>Threads</h1>
      <p style={{ margin: 0 }}>Select an assistant, create a thread, then start chatting.</p>

      {statusMessage ? (
        <p
          role={statusKind === 'error' ? 'alert' : 'status'}
          style={{ margin: 0, color: statusKind === 'error' ? '#ff6b6b' : '#6cd96c' }}
        >
          {statusMessage}
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" style={{ margin: 0, color: '#ff6b6b' }}>
          {loadError}
        </p>
      ) : null}

      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: '240px 260px minmax(360px, 1fr)',
          alignItems: 'start'
        }}
      >
        <aside style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Assistants</h2>
            <button
              type="button"
              onClick={() => {
                setIsCreatingAssistant(true)
                setStatusMessage(null)
              }}
              disabled={isSavingAssistant}
            >
              + New
            </button>
          </div>

          {isLoadingData ? <p style={{ margin: 0 }}>Loading assistants...</p> : null}

          {!isLoadingData && assistants.length === 0 ? (
            <p style={{ margin: 0 }}>No assistants yet.</p>
          ) : null}

          <div style={{ display: 'grid', gap: '8px' }}>
            {assistants.map((assistant) => {
              const isActive = selectedAssistant?.id === assistant.id && !isCreatingAssistant
              return (
                <button
                  key={assistant.id}
                  type="button"
                  onClick={() => handleSelectAssistant(assistant.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `1px solid ${isActive ? '#6cd96c' : '#3a3a3a'}`,
                    background: isActive ? '#1b261b' : '#0f0f0f',
                    color: '#f8f8f8'
                  }}
                >
                  <div>{assistant.name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>{assistant.providerId}</div>
                </button>
              )
            })}
          </div>
        </aside>

        <aside style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Threads</h2>
            <button
              type="button"
              onClick={() => void handleCreateThread()}
              disabled={!selectedAssistant || isCreatingThread}
            >
              {isCreatingThread ? 'Creating...' : '+ New'}
            </button>
          </div>

          {isLoadingThreads ? <p style={{ margin: 0 }}>Loading threads...</p> : null}

          {!isLoadingThreads && selectedAssistant && threads.length === 0 ? (
            <p style={{ margin: 0 }}>No threads yet.</p>
          ) : null}

          <div style={{ display: 'grid', gap: '8px' }}>
            {threads.map((thread) => {
              const isActive = params.threadId === thread.id
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => navigate(routeToAssistantThreads(thread.assistantId, thread.id))}
                  style={{
                    textAlign: 'left',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `1px solid ${isActive ? '#6cd96c' : '#3a3a3a'}`,
                    background: isActive ? '#1b261b' : '#101010',
                    color: '#f8f8f8'
                  }}
                >
                  <div>{thread.title}</div>
                  <div style={{ fontSize: '12px', opacity: 0.75 }}>
                    {thread.lastMessageAt ?? 'No messages yet'}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: '12px' }}>
          <h2 style={{ margin: 0 }}>{selectedThread?.title ?? 'Thread Setup'}</h2>

          {showAssistantEditor ? (
            <AssistantEditor
              key={isCreatingAssistant ? 'new-assistant' : selectedAssistant?.id}
              providers={providers}
              initialValue={isCreatingAssistant ? null : selectedAssistant}
              isSubmitting={isSavingAssistant}
              onSubmit={handleSubmitAssistant}
            />
          ) : (
            <p style={{ margin: 0 }}>Create an assistant to begin.</p>
          )}

          {!readiness.canChat ? (
            <section
              style={{
                border: '1px solid #ffb86b',
                borderRadius: '10px',
                padding: '12px',
                background: '#2a2217'
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '8px' }}>Complete assistant setup</h3>
              <p style={{ marginTop: 0 }}>
                Composer is hidden until workspace, provider, and selected model are ready.
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
                {readiness.checks.map((check) => (
                  <li key={check.id}>
                    {check.ready ? 'Done' : 'Missing'}: {check.label}
                    {!check.ready ? (
                      <>
                        {' '}
                        <Link to={check.ctaPath}>Configure</Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section
              style={{
                border: '1px solid #3a3a3a',
                borderRadius: '10px',
                padding: '12px',
                background: '#141414'
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '8px' }}>Composer ready</h3>
              <p style={{ margin: 0 }}>
                Assistant setup checks passed. Streaming chat UI lands in the next step.
              </p>
            </section>
          )}
        </main>
      </div>
    </section>
  )
}

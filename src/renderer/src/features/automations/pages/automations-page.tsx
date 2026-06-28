import { Clock3, PauseCircle, Play, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { cn } from '../../../lib/utils'
import { useWorkspaces } from '../../workspaces/workspaces-query'

type AutomationFrequencyMode = 'weekly' | 'interval' | 'once'

type AutomationRecord = {
  id: string
  name: string
  workspaceName: string
  prompt: string
  connectorName: string
  accessLevel: 'full' | 'confirm'
  frequencyMode: AutomationFrequencyMode
  frequencyLabel: string
  time: string
  startDate: string
  nextRunLabel: string
  runCount: number
  status: 'running' | 'paused'
}

const defaultAutomations: AutomationRecord[] = [
  {
    id: 'automation-monday-review',
    name: 'Weekly review',
    workspaceName: 'automation-2026-06-27-15-31-50',
    prompt: 'Review the latest workspace threads and summarize what changed since the last run.',
    connectorName: 'None selected',
    accessLevel: 'full',
    frequencyMode: 'weekly',
    frequencyLabel: 'Every Monday',
    time: '09:00',
    startDate: '',
    nextRunLabel: 'Starts in 1 day',
    runCount: 0,
    status: 'running'
  },
  {
    id: 'automation-nightly-triage',
    name: 'Nightly triage',
    workspaceName: 'Research board',
    prompt: 'Collect fresh notes, highlight blockers, and draft a short daily follow-up.',
    connectorName: 'Linear',
    accessLevel: 'confirm',
    frequencyMode: 'interval',
    frequencyLabel: 'Every 12 hours',
    time: '20:30',
    startDate: '',
    nextRunLabel: 'Tonight',
    runCount: 4,
    status: 'paused'
  }
]

function emptyAutomation(workspaceName: string): AutomationRecord {
  return {
    id: `automation-${Date.now()}`,
    name: '',
    workspaceName,
    prompt: '',
    connectorName: 'None selected',
    accessLevel: 'full',
    frequencyMode: 'weekly',
    frequencyLabel: 'Every Monday',
    time: '09:00',
    startDate: '',
    nextRunLabel: 'Not scheduled yet',
    runCount: 0,
    status: 'running'
  }
}

export function AutomationsPage(): React.JSX.Element {
  const { data: workspaces = [] } = useWorkspaces()
  const namedWorkspaceNames = useMemo(() => {
    const names = workspaces
      .filter((workspace) => workspace.builtInKind !== 'chats')
      .map((workspace) => workspace.name)

    return names.length > 0 ? names : ['automation-2026-06-27-15-31-50', 'Research board']
  }, [workspaces])

  const [automations, setAutomations] = useState<AutomationRecord[]>(defaultAutomations)
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>(defaultAutomations[0].id)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [draftAutomation, setDraftAutomation] = useState<AutomationRecord>(() =>
    emptyAutomation(namedWorkspaceNames[0] ?? '')
  )

  const selectedAutomation = useMemo(
    () => automations.find((automation) => automation.id === selectedAutomationId) ?? null,
    [automations, selectedAutomationId]
  )

  const openCreateDialog = (fromTemplate: boolean): void => {
    setEditorMode('create')
    setDraftAutomation({
      ...emptyAutomation(namedWorkspaceNames[0] ?? ''),
      name: fromTemplate ? 'Template automation' : '',
      prompt: fromTemplate
        ? 'Summarize the latest workspace activity and prepare a short daily brief.'
        : '',
      connectorName: fromTemplate ? 'Slack' : 'None selected'
    })
    setIsEditorOpen(true)
  }

  const openEditDialog = (automation: AutomationRecord): void => {
    setEditorMode('edit')
    setDraftAutomation(automation)
    setIsEditorOpen(true)
  }

  const handleSaveAutomation = (): void => {
    setAutomations((current) => {
      if (editorMode === 'edit') {
        return current.map((automation) =>
          automation.id === draftAutomation.id ? draftAutomation : automation
        )
      }

      return [draftAutomation, ...current]
    })
    setSelectedAutomationId(draftAutomation.id)
    setIsEditorOpen(false)
  }

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="border-b border-[color:var(--surface-border)] px-8 py-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <h1 className="font-editorial text-[2.6rem] leading-none tracking-[-0.04em]">
                Automations
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage scheduled tasks and review the runs that matter right now.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl px-5"
                onClick={() => openCreateDialog(true)}
              >
                Add from template
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl px-5"
                onClick={() => openCreateDialog(false)}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-3">
            {automations.map((automation) => {
              const isActive = automation.id === selectedAutomationId

              return (
                <button
                  key={automation.id}
                  type="button"
                  className={cn(
                    'flex w-full flex-col gap-4 rounded-[1.4rem] border px-5 py-4 text-left transition-colors lg:flex-row lg:items-center lg:justify-between',
                    isActive
                      ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                      : 'border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] hover:bg-[color:var(--surface-muted)]'
                  )}
                  onClick={() => {
                    setSelectedAutomationId(automation.id)
                    openEditDialog(automation)
                  }}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span
                      className={cn(
                        'inline-flex size-3 shrink-0 rounded-full',
                        automation.status === 'running' ? 'bg-emerald-500' : 'bg-amber-400'
                      )}
                    />
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-editorial text-[1.3rem] leading-none tracking-[-0.02em]">
                          {automation.name}
                        </p>
                        <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                          {automation.workspaceName}
                        </span>
                        <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                          {automation.frequencyLabel} · {automation.time}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground lg:text-right">
                    {automation.nextRunLabel}
                  </div>
                </button>
              )
            })}
          </div>

          {selectedAutomation ? (
            <div className="pt-6">
              <div className="rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_68%,transparent))] px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <p className="font-editorial text-[1.45rem] leading-none tracking-[-0.02em]">
                      {selectedAutomation.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{selectedAutomation.prompt}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                      {selectedAutomation.runCount} runs
                    </span>
                    <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                      {selectedAutomation.connectorName}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="glass-pane-surface max-w-5xl gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none">
          <div className="flex max-h-[80vh] flex-col">
            <DialogHeader className="space-y-2 border-b border-[color:var(--surface-border)] px-6 py-6 sm:text-left">
              <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
                <DialogTitle className="text-[2.5rem]">
                  {editorMode === 'edit' ? 'Edit automation task' : 'Create automation task'}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>Created 6/27/2026</span>
                  <span>{draftAutomation.runCount} runs</span>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex size-3 rounded-full',
                        draftAutomation.status === 'running' ? 'bg-emerald-500' : 'bg-amber-400'
                      )}
                    />
                    {draftAutomation.status === 'running' ? 'Running' : 'Paused'}
                  </span>
                </div>
              </div>
              <DialogDescription>
                Keep the schedule simple now. We can wire the real backend automation editor later.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-5">
                <div className="space-y-2">
                  <label htmlFor="automation-name" className="text-sm font-medium text-foreground">
                    Name
                  </label>
                  <Input
                    id="automation-name"
                    value={draftAutomation.name}
                    onChange={(event) =>
                      setDraftAutomation((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Weekly review"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="automation-workspace"
                    className="text-sm font-medium text-foreground"
                  >
                    Workspace
                  </label>
                  <select
                    id="automation-workspace"
                    className="h-11 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 text-sm"
                    value={draftAutomation.workspaceName}
                    onChange={(event) =>
                      setDraftAutomation((current) => ({
                        ...current,
                        workspaceName: event.target.value
                      }))
                    }
                  >
                    {namedWorkspaceNames.map((workspaceName) => (
                      <option key={workspaceName} value={workspaceName}>
                        {workspaceName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="automation-prompt"
                    className="text-sm font-medium text-foreground"
                  >
                    Prompt
                  </label>
                  <Textarea
                    id="automation-prompt"
                    value={draftAutomation.prompt}
                    onChange={(event) =>
                      setDraftAutomation((current) => ({ ...current, prompt: event.target.value }))
                    }
                    className="min-h-[16rem]"
                    placeholder="Summarize the latest workspace activity."
                  />
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>Auto</span>
                    <span>Skills</span>
                    <span>Experts</span>
                    <span>
                      {draftAutomation.accessLevel === 'full' ? 'Full access' : 'Confirm use'}
                    </span>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="automation-connector"
                      className="text-sm font-medium text-foreground"
                    >
                      Connector
                    </label>
                    <select
                      id="automation-connector"
                      className="h-11 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 text-sm"
                      value={draftAutomation.connectorName}
                      onChange={(event) =>
                        setDraftAutomation((current) => ({
                          ...current,
                          connectorName: event.target.value
                        }))
                      }
                    >
                      {['None selected', 'Slack', 'Linear', 'Google Drive'].map((connector) => (
                        <option key={connector} value={connector}>
                          {connector}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Execution frequency</span>
                    <div className="flex gap-2">
                      {[
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'interval', label: 'Interval' },
                        { value: 'once', label: 'Once' }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            'rounded-xl px-4 py-2 text-sm transition-colors',
                            draftAutomation.frequencyMode === option.value
                              ? 'bg-[color:var(--surface-active)] text-foreground'
                              : 'bg-[color:var(--surface-paper)] text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
                          )}
                          onClick={() =>
                            setDraftAutomation((current) => ({
                              ...current,
                              frequencyMode: option.value as AutomationFrequencyMode,
                              frequencyLabel:
                                option.value === 'weekly'
                                  ? 'Every Monday'
                                  : option.value === 'interval'
                                    ? 'Every 12 hours'
                                    : 'Run once'
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <label
                      htmlFor="automation-frequency-label"
                      className="text-sm font-medium text-foreground"
                    >
                      Schedule
                    </label>
                    <Input
                      id="automation-frequency-label"
                      value={draftAutomation.frequencyLabel}
                      onChange={(event) =>
                        setDraftAutomation((current) => ({
                          ...current,
                          frequencyLabel: event.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="automation-time"
                      className="text-sm font-medium text-foreground"
                    >
                      Time
                    </label>
                    <Input
                      id="automation-time"
                      value={draftAutomation.time}
                      onChange={(event) =>
                        setDraftAutomation((current) => ({ ...current, time: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="automation-start-date"
                    className="text-sm font-medium text-foreground"
                  >
                    Start date
                  </label>
                  <Input
                    id="automation-start-date"
                    value={draftAutomation.startDate}
                    onChange={(event) =>
                      setDraftAutomation((current) => ({
                        ...current,
                        startDate: event.target.value
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_72%,transparent),color-mix(in_srgb,var(--surface-panel)_90%,transparent))] px-6 py-4 backdrop-blur-xl">
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="destructive">
                  Delete
                </Button>
                <Button type="button" variant="outline">
                  <Play className="size-4" />
                  Test run
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDraftAutomation((current) => ({
                      ...current,
                      status: current.status === 'running' ? 'paused' : 'running'
                    }))
                  }
                >
                  {draftAutomation.status === 'running' ? (
                    <>
                      <PauseCircle className="size-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Clock3 className="size-4" />
                      Resume
                    </>
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => setIsEditorOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveAutomation}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

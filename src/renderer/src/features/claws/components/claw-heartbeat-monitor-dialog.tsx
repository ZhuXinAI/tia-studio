import { useEffect, useState } from 'react'
import { Activity, Clock, CheckCircle2, XCircle, Settings } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Switch } from '../../../components/ui/switch'
import { Textarea } from '../../../components/ui/textarea'
import {
  getAssistantHeartbeat,
  getHeartbeatRunsOnly,
  updateAssistantHeartbeat,
  type AssistantHeartbeatRecord,
  type HeartbeatRunRecord
} from '../../assistants/assistant-heartbeat-query'

type ClawHeartbeatMonitorDialogProps = {
  isOpen: boolean
  assistantId: string | null
  assistantName: string
  onClose: () => void
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString()
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const durationMs = end - start
  const seconds = Math.floor(durationMs / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function ClawHeartbeatMonitorDialog({
  isOpen,
  assistantId,
  assistantName,
  onClose
}: ClawHeartbeatMonitorDialogProps): React.JSX.Element {
  const [heartbeat, setHeartbeat] = useState<AssistantHeartbeatRecord | null>(null)
  const [runs, setRuns] = useState<HeartbeatRunRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editEnabled, setEditEnabled] = useState(false)
  const [editIntervalMinutes, setEditIntervalMinutes] = useState(60)
  const [editPrompt, setEditPrompt] = useState('')

  async function loadData(): Promise<void> {
    if (!assistantId) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const [heartbeatData, runsData] = await Promise.all([
        getAssistantHeartbeat(assistantId),
        getHeartbeatRunsOnly(assistantId)
      ])

      setHeartbeat(heartbeatData)
      setRuns(runsData.runs)

      // Initialize edit form with current values
      if (heartbeatData) {
        setEditEnabled(heartbeatData.enabled)
        setEditIntervalMinutes(heartbeatData.intervalMinutes)
        setEditPrompt(heartbeatData.prompt)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load heartbeat data')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!assistantId) {
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      await updateAssistantHeartbeat(assistantId, {
        enabled: editEnabled,
        intervalMinutes: editIntervalMinutes,
        prompt: editPrompt
      })
      await loadData()
      setIsEditing(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save heartbeat settings')
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancelEdit(): void {
    if (heartbeat) {
      setEditEnabled(heartbeat.enabled)
      setEditIntervalMinutes(heartbeat.intervalMinutes)
      setEditPrompt(heartbeat.prompt)
    }
    setIsEditing(false)
  }

  useEffect(() => {
    if (isOpen && assistantId) {
      void loadData()
    }
  }, [isOpen, assistantId])

  useEffect(() => {
    if (!isOpen || !assistantId) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadData()
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isOpen, assistantId])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Heartbeat Monitor - {assistantName}
          </DialogTitle>
          <DialogDescription>
            Configure and monitor heartbeat executions
          </DialogDescription>
        </DialogHeader>

        {isLoading && !heartbeat ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : errorMessage ? (
          <div className="py-4 text-sm text-destructive">{errorMessage}</div>
        ) : (
          <div className="space-y-4">
            {heartbeat ? (
              <>
                {isEditing ? (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Heartbeat Configuration</h3>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="enabled">Enabled</Label>
                        <Switch
                          id="enabled"
                          checked={editEnabled}
                          onCheckedChange={setEditEnabled}
                          disabled={isSaving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="interval">Interval (minutes)</Label>
                        <Input
                          id="interval"
                          type="number"
                          min="1"
                          value={editIntervalMinutes}
                          onChange={(e) => setEditIntervalMinutes(Number(e.target.value))}
                          disabled={isSaving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="prompt">Prompt</Label>
                        <Textarea
                          id="prompt"
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          disabled={isSaving}
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-medium">Heartbeat Configuration</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                      >
                        <Settings className="size-4 mr-1" />
                        Configure
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              heartbeat.enabled
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {heartbeat.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Interval</div>
                        <div className="mt-1 text-sm font-medium">{heartbeat.intervalMinutes} minutes</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground">Prompt</div>
                        <div className="mt-1 text-sm">{heartbeat.prompt}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Last Run</div>
                        <div className="mt-1 text-sm">
                          {heartbeat.lastRunAt ? formatDateTime(heartbeat.lastRunAt) : 'Never'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Next Run</div>
                        <div className="mt-1 text-sm">
                          {heartbeat.nextRunAt ? formatDateTime(heartbeat.nextRunAt) : 'Not scheduled'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {heartbeat?.lastError ? (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <div className="text-xs font-medium text-destructive">Last Error</div>
                    <div className="mt-1 text-sm text-destructive/90">{heartbeat.lastError}</div>
                  </div>
                ) : null}
              </>
            ) : null}

        <div>
              <div className="mb-2 text-sm font-medium">Recent Heartbeat Runs (Last 10)</div>
              {runs.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No heartbeat runs yet
                </div>
              ) : (
                <div className="h-[300px] overflow-y-auto rounded-lg border">
                  <div className="divide-y">
                    {runs.map((run) => (
                      <div key={run.id} className="p-4 hover:bg-muted/50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {run.status === 'success' ? (
                              <CheckCircle2 className="mt-0.5 size-5 text-green-600" />
                            ) : (
                              <XCircle className="mt-0.5 size-5 text-destructive" />
                            )}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    run.status === 'success'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}
                                >
                                  {run.status}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateTime(run.scheduledFor)}
                                </span>
                              </div>
                              {run.outputText ? (
                                <div className="max-w-xl text-sm text-muted-foreground">
                                  {run.outputText.length > 200
                                    ? `${run.outputText.slice(0, 200)}...`
                                    : run.outputText}
                                </div>
                              ) : null}
                              {run.error ? (
                                <div className="text-sm text-destructive">
                                  Error: {String(run.error.message ?? 'Unknown error')}
                                </div>
                        ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {formatDuration(run.startedAt, run.finishedAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

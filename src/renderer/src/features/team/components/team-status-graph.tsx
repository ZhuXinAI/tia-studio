import { useMemo } from 'react'
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'
import type { TeamStatusEvent } from '../team-status-stream'

type TeamStatusGraphProps = {
  assistants: Array<{ id: string; name: string }>
  events: TeamStatusEvent[]
  showEventLog?: boolean
}

type StatusState = 'idle' | 'running' | 'done' | 'error'

const statusStyles: Record<StatusState, string> = {
  idle: 'border-border/70 bg-background/95 text-foreground',
  running: 'border-blue-500/60 bg-blue-500/10 text-blue-200 shadow-blue-500/10',
  done: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200 shadow-emerald-500/10',
  error: 'border-red-500/60 bg-red-500/10 text-red-200 shadow-red-500/10'
}

function formatEventText(event: TeamStatusEvent, assistantNames: Map<string, string>): string {
  const primitiveId =
    typeof event.data?.primitiveId === 'string' ? event.data.primitiveId : undefined
  const assistantLabel = primitiveId ? (assistantNames.get(primitiveId) ?? primitiveId) : 'A member'

  switch (event.type) {
    case 'run-started':
      return 'Run started.'
    case 'delegation-started':
      return `${assistantLabel} is running.`
    case 'delegation-finished':
      return `${assistantLabel} finished.`
    case 'iteration-complete':
      return `Iteration ${String(event.data?.iteration ?? 0)} complete.`
    case 'run-finished':
      return 'Run finished.'
    case 'run-failed':
      return typeof event.data?.error === 'string' ? event.data.error : 'Run failed.'
  }
}

function renderNodeLabel(label: string, state: StatusState): React.JSX.Element {
  return (
    <div
      data-state={state}
      className={cn(
        'rounded-lg border px-3 py-2 text-center text-sm shadow-sm transition-colors',
        statusStyles[state]
      )}
    >
      {label}
    </div>
  )
}

export function TeamStatusGraph({
  assistants,
  events,
  showEventLog = true
}: TeamStatusGraphProps): React.JSX.Element {
  const assistantNames = useMemo(() => {
    return new Map(assistants.map((assistant) => [assistant.id, assistant.name]))
  }, [assistants])

  const assistantStates = useMemo(() => {
    const states = new Map<string, StatusState>()

    for (const assistant of assistants) {
      states.set(assistant.id, 'idle')
    }

    for (const event of events) {
      const primitiveId =
        typeof event.data?.primitiveId === 'string' ? event.data.primitiveId : undefined
      if (!primitiveId) {
        continue
      }

      if (event.type === 'delegation-started') {
        states.set(primitiveId, 'running')
      }

      if (event.type === 'delegation-finished') {
        states.set(primitiveId, 'done')
      }
    }

    return states
  }, [assistants, events])

  const supervisorState = useMemo<StatusState>(() => {
    if (events.some((event) => event.type === 'run-failed')) {
      return 'error'
    }
    if (events.some((event) => event.type === 'run-finished')) {
      return 'done'
    }
    if (events.some((event) => event.type === 'run-started')) {
      return 'running'
    }

    return 'idle'
  }, [events])

  const nodes = useMemo<Node[]>(() => {
    const graphNodes: Node[] = [
      {
        id: 'supervisor',
        position: { x: 200, y: 20 },
        data: {
          label: renderNodeLabel('Supervisor', supervisorState)
        }
      }
    ]

    assistants.forEach((assistant, index) => {
      graphNodes.push({
        id: assistant.id,
        position: { x: index * 170 + 20, y: 170 },
        data: {
          label: renderNodeLabel(assistant.name, assistantStates.get(assistant.id) ?? 'idle')
        }
      })
    })

    return graphNodes
  }, [assistantStates, assistants, supervisorState])

  const edges = useMemo<Edge[]>(() => {
    return assistants.map((assistant) => ({
      id: `supervisor-${assistant.id}`,
      source: 'supervisor',
      target: assistant.id,
      animated: assistantStates.get(assistant.id) === 'running'
    }))
  }, [assistantStates, assistants])

  const eventLog = useMemo(() => {
    return events.map((event) => ({
      id: `${event.runId}:${event.createdAt}:${event.type}`,
      text: formatEventText(event, assistantNames)
    }))
  }, [assistantNames, events])

  return (
    <Card className="flex h-full min-h-0 flex-col border-border/80 bg-card/78">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-base">Team Status</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 py-4">
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border/70 bg-muted/15',
            showEventLog ? 'h-72' : 'min-h-0 flex-1'
          )}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            selectionOnDrag={false}
            selectNodesOnDrag={false}
            zoomOnScroll={false}
            panOnDrag={false}
            panActivationKeyCode={null}
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {showEventLog ? (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/70 bg-muted/15 p-3">
            <h3 className="mb-2 text-sm font-medium">Event Log</h3>
            {eventLog.length === 0 ? (
              <p className="text-muted-foreground text-sm">No status events yet.</p>
            ) : (
              <div className="chat-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 text-sm">
                {eventLog.map((event) => (
                  <p key={event.id}>{event.text}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

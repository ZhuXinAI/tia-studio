import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

const flowMockState = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null
}))

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    children,
    ...props
  }: {
    nodes: Array<{ id: string; data: { label: React.ReactNode } }>
    [key: string]: unknown
    children?: React.ReactNode
  }) => {
    flowMockState.props = props

    return (
      <div data-slot="react-flow">
        {nodes.map((node) => (
          <div key={node.id}>{node.data.label}</div>
        ))}
        {children}
      </div>
    )
  },
  Background: () => <div data-slot="react-flow-background" />,
  Controls: () => <div data-slot="react-flow-controls" />
}))

import { TeamStatusGraph } from './team-status-graph'

describe('TeamStatusGraph', () => {
  it('renders react flow in fully static inspection mode', () => {
    renderToString(<TeamStatusGraph assistants={[]} events={[]} />)

    expect(flowMockState.props).toEqual(
      expect.objectContaining({
        nodesDraggable: false,
        nodesConnectable: false,
        elementsSelectable: false,
        selectionOnDrag: false,
        selectNodesOnDrag: false,
        nodesFocusable: false,
        edgesFocusable: false,
        panOnDrag: false,
        panActivationKeyCode: null,
        zoomOnScroll: false
      })
    )
  })

  it('can render graph-only mode without the event log', () => {
    const html = renderToString(<TeamStatusGraph assistants={[]} events={[]} showEventLog={false} />)

    expect(html).toContain('Team Status')
    expect(html).not.toContain('Event Log')
  })

  it('marks a member node running after delegation-started with visible styles', () => {
    const html = renderToString(
      <TeamStatusGraph
        assistants={[{ id: 'assistant-1', name: 'Planner' }]}
        events={[
          {
            type: 'delegation-started',
            runId: 'run-1',
            threadId: 'thread-1',
            createdAt: '2026-03-07T00:00:00.000Z',
            data: {
              primitiveId: 'assistant-1'
            }
          }
        ]}
      />
    )

    expect(html).toContain('Planner')
    expect(html).toContain('data-state="running"')
    expect(html).toContain('Planner is running.')
    expect(html).toContain('border-blue-500/60')
  })

  it('shows supervisor error styling when the run fails', () => {
    const html = renderToString(
      <TeamStatusGraph
        assistants={[{ id: 'assistant-1', name: 'Planner' }]}
        events={[
          {
            type: 'run-started',
            runId: 'run-1',
            threadId: 'thread-1',
            createdAt: '2026-03-07T00:00:00.000Z'
          },
          {
            type: 'run-failed',
            runId: 'run-1',
            threadId: 'thread-1',
            createdAt: '2026-03-07T00:00:05.000Z',
            data: {
              error: 'Planner failed'
            }
          }
        ]}
      />
    )

    expect(html).toContain('Supervisor')
    expect(html).toContain('data-state="error"')
    expect(html).toContain('Planner failed')
    expect(html).toContain('border-red-500/60')
  })
})

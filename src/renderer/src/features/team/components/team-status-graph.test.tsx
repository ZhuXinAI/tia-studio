import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    children
  }: {
    nodes: Array<{ id: string; data: { label: React.ReactNode } }>
    children?: React.ReactNode
  }) => (
    <div data-slot="react-flow">
      {nodes.map((node) => (
        <div key={node.id}>{node.data.label}</div>
      ))}
      {children}
    </div>
  ),
  Background: () => <div data-slot="react-flow-background" />,
  Controls: () => <div data-slot="react-flow-controls" />
}))

import { TeamStatusGraph } from './team-status-graph'

describe('TeamStatusGraph', () => {
  it('marks a member node running after delegation-started', () => {
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
  })
})

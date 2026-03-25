// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClawCronMonitorDialog } from './claw-cron-monitor-dialog'
import { listCronJobs } from '../../settings/cron-jobs/cron-jobs-query'

vi.mock('../../settings/cron-jobs/cron-jobs-query', () => ({
  listCronJobs: vi.fn()
}))

describe('ClawCronMonitorDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('shows configured cron jobs and next run times for the selected assistant', async () => {
    vi.mocked(listCronJobs).mockResolvedValue([
      {
        id: 'cron-1',
        assistantId: 'assistant-1',
        threadId: 'thread-1',
        name: 'Daily Standup',
        prompt: 'Summarize the latest work and blockers.',
        cronExpression: '0 9 * * *',
        enabled: true,
        lastRunAt: '2026-03-24T00:00:00.000Z',
        nextRunAt: '2026-03-25T01:00:00.000Z',
        lastRunStatus: 'success',
        lastError: null,
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z'
      },
      {
        id: 'cron-2',
        assistantId: 'assistant-2',
        threadId: 'thread-2',
        name: 'Other Assistant Job',
        prompt: 'Ignore me.',
        cronExpression: '0 * * * *',
        enabled: true,
        lastRunAt: null,
        nextRunAt: null,
        lastRunStatus: null,
        lastError: null,
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z'
      }
    ])

    await act(async () => {
      root.render(
        <ClawCronMonitorDialog
          isOpen
          assistantId="assistant-1"
          assistantName="Planner"
          onClose={() => undefined}
        />
      )
    })

    expect(listCronJobs).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Configured Cron Jobs')
    expect(document.body.textContent).toContain('Daily Standup')
    expect(document.body.textContent).toContain('0 9 * * *')
    expect(document.body.textContent).not.toContain('Other Assistant Job')
  })
})

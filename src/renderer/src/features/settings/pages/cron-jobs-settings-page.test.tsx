// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CronJobsSettingsPage } from './cron-jobs-settings-page'
import { listAssistants } from '../../assistants/assistants-query'
import { listCronJobs } from '../cron-jobs/cron-jobs-query'

vi.mock('../../assistants/assistants-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../assistants/assistants-query')>()

  return {
    ...actual,
    listAssistants: vi.fn()
  }
})

vi.mock('../cron-jobs/cron-jobs-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cron-jobs/cron-jobs-query')>()

  return {
    ...actual,
    listCronJobs: vi.fn()
  }
})

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('cron jobs settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(listAssistants).mockResolvedValue([
      {
        id: 'assistant-1',
        name: 'Workspace Scheduler',
        description: '',
        instructions: '',
        providerId: 'provider-1',
        enabled: true,
        workspaceConfig: { rootPath: '/tmp/workspace-a' },
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-09T00:00:00.000Z',
        updatedAt: '2026-03-09T00:00:00.000Z'
      }
    ])
    vi.mocked(listCronJobs).mockResolvedValue([
      {
        id: 'cron-job-1',
        assistantId: 'assistant-1',
        threadId: 'thread-1',
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: '0 9 * * 1-5',
        enabled: true,
        lastRunAt: '2026-03-09T09:00:00.000Z',
        nextRunAt: '2026-03-10T09:00:00.000Z',
        lastRunStatus: 'failed',
        lastError: 'Provider timed out',
        createdAt: '2026-03-09T00:00:00.000Z',
        updatedAt: '2026-03-09T00:00:00.000Z'
      }
    ])
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('shows persisted runtime status, errors, and next-run timestamps', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CronJobsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Cron Jobs')
    expect(container.textContent).toContain('Morning summary')
    expect(container.textContent).toContain('Workspace Scheduler')
    expect(container.textContent).toContain('failed')
    expect(container.textContent).toContain('Provider timed out')
    expect(container.textContent).toContain('3/10/2026')
  })
})

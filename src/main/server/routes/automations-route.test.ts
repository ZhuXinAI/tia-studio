import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AutomationRunRecord } from '../../../shared/automation-runs'
import type { AutomationService } from '../../automations/automation-service'
import type { AutomationsRepository } from '../../persistence/repos/automations-repo'
import type { AutomationRunsRepository } from '../../persistence/repos/automation-runs-repo'
import { registerAutomationsRoute } from './automations-route'

const reviewedRun: AutomationRunRecord = {
  id: 'run-1',
  automationId: 'automation-1',
  sessionId: 'session-1',
  status: 'completed',
  startedAt: '2026-08-08T00:00:00.000Z',
  completedAt: '2026-08-08T00:01:00.000Z',
  summary: 'Reviewed by user',
  error: null
}

describe('automations route', () => {
  it('marks a review-queue run as completed', async () => {
    const markReviewed = vi.fn(async () => reviewedRun)
    const app = new Hono()
    registerAutomationsRoute(app, {
      repository: {} as AutomationsRepository,
      runsRepository: {
        listByAutomation: vi.fn(),
        listNeedsReview: vi.fn(),
        markReviewed
      } as unknown as Pick<
        AutomationRunsRepository,
        'listByAutomation' | 'listNeedsReview' | 'markReviewed'
      >,
      service: {} as AutomationService
    })

    const response = await app.request('http://localhost/v1/automation-runs/run-1/review', {
      method: 'PATCH'
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(reviewedRun)
    expect(markReviewed).toHaveBeenCalledWith('run-1')
  })

  it('returns not found when a review run has disappeared', async () => {
    const app = new Hono()
    registerAutomationsRoute(app, {
      repository: {} as AutomationsRepository,
      runsRepository: {
        listByAutomation: vi.fn(),
        listNeedsReview: vi.fn(),
        markReviewed: vi.fn(async () => null)
      } as unknown as Pick<
        AutomationRunsRepository,
        'listByAutomation' | 'listNeedsReview' | 'markReviewed'
      >,
      service: {} as AutomationService
    })

    const response = await app.request('http://localhost/v1/automation-runs/missing/review', {
      method: 'PATCH'
    })

    expect(response.status).toBe(404)
  })
})

import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { appendWorkLogEntry } from '../cron/work-log-writer'
import { buildHeartbeatWorklogContext } from './heartbeat-context'

describe('heartbeat context', () => {
  let workspaceRoot: string | null = null

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = null
    }
  })

  it('returns null when there are no recent work-log entries in the heartbeat window', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-heartbeat-context-'))
    await appendWorkLogEntry({
      workspaceRootPath: workspaceRoot,
      assistantName: 'TIA',
      outputText: 'Too old.',
      occurredAt: new Date('2026-03-09T20:00:00.000Z')
    })

    const context = await buildHeartbeatWorklogContext({
      workspaceRootPath: workspaceRoot,
      intervalMinutes: 30,
      now: new Date('2026-03-10T00:30:00.000Z')
    })

    expect(context).toBeNull()
  })

  it('includes only work-log entries from the current heartbeat window', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-heartbeat-context-'))
    await appendWorkLogEntry({
      workspaceRootPath: workspaceRoot,
      assistantName: 'TIA',
      outputText: 'Recent status update.',
      occurredAt: new Date('2026-03-10T00:15:00.000Z')
    })
    await appendWorkLogEntry({
      workspaceRootPath: workspaceRoot,
      assistantName: 'TIA',
      outputText: 'Older status update.',
      occurredAt: new Date('2026-03-09T23:00:00.000Z')
    })

    const context = await buildHeartbeatWorklogContext({
      workspaceRootPath: workspaceRoot,
      intervalMinutes: 30,
      now: new Date('2026-03-10T00:30:00.000Z')
    })

    expect(context).toContain('Recent work-log context')
    expect(context).toContain('Recent status update.')
    expect(context).not.toContain('Older status update.')
  })
})

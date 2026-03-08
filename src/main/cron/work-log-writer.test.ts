import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendWorkLogEntry, resolveWorkLogPath } from './work-log-writer'

describe('work log writer', () => {
  let workspaceRoot: string

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-work-logs-'))
  })

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('appends entries to the daily markdown work log under the workspace log directory', async () => {
    const firstTimestamp = new Date('2026-03-09T08:30:00.000Z')
    const secondTimestamp = new Date('2026-03-09T09:45:00.000Z')
    const expectedPath = path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-09.md')

    expect(resolveWorkLogPath(workspaceRoot, firstTimestamp)).toBe(expectedPath)

    await expect(
      appendWorkLogEntry({
        workspaceRootPath: workspaceRoot,
        assistantName: 'TIA',
        cronJobName: 'Morning summary',
        outputText: 'Checked build health.',
        occurredAt: firstTimestamp
      })
    ).resolves.toBe(expectedPath)

    await appendWorkLogEntry({
      workspaceRootPath: workspaceRoot,
      assistantName: 'TIA',
      cronJobName: 'Morning summary',
      outputText: 'Reviewed open issues.',
      occurredAt: secondTimestamp
    })

    const content = await readFile(expectedPath, 'utf8')
    expect(content.match(/^# Work Log — 2026-03-09$/gm)).toHaveLength(1)
    expect(content).toContain('## 2026-03-09T08:30:00.000Z — TIA — Morning summary')
    expect(content).toContain('Checked build health.')
    expect(content).toContain('## 2026-03-09T09:45:00.000Z — TIA — Morning summary')
    expect(content).toContain('Reviewed open issues.')
  })
})

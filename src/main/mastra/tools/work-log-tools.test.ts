import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorkLogTools } from './work-log-tools'

describe('work log tools', () => {
  let workspaceRoot: string

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-work-log-tools-'))
    await mkdir(path.join(workspaceRoot, '.tia', 'work-logs'), { recursive: true })
    await writeFile(
      path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-08.md'),
      '# Work Log — 2026-03-08\n\n## 2026-03-08T09:00:00.000Z — TIA — Morning summary\n\nChecked build health.\n',
      'utf8'
    )
    await writeFile(
      path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-09.md'),
      '# Work Log — 2026-03-09\n\n## 2026-03-09T09:00:00.000Z — TIA — Morning summary\n\nReviewed open issues.\n',
      'utf8'
    )
  })

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('lists available work logs', async () => {
    const tools = createWorkLogTools({ workspaceRootPath: workspaceRoot })
    if (!tools.listWorkLogs.execute) {
      throw new Error('Expected listWorkLogs.execute to exist')
    }

    const result = await tools.listWorkLogs.execute({}, {} as never)

    expect(result).toEqual({
      logs: [
        {
          fileName: '2026-03-09.md',
          path: path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-09.md')
        },
        {
          fileName: '2026-03-08.md',
          path: path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-08.md')
        }
      ]
    })
  })

  it('reads a single work log by file name', async () => {
    const tools = createWorkLogTools({ workspaceRootPath: workspaceRoot })
    if (!tools.readWorkLog.execute) {
      throw new Error('Expected readWorkLog.execute to exist')
    }

    const result = await tools.readWorkLog.execute(
      {
        fileName: '2026-03-08.md'
      },
      {} as never
    )

    expect(result).toEqual({
      fileName: '2026-03-08.md',
      path: path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-08.md'),
      content:
        '# Work Log — 2026-03-08\n\n## 2026-03-08T09:00:00.000Z — TIA — Morning summary\n\nChecked build health.\n'
    })
  })

  it('searches work logs by query string', async () => {
    const tools = createWorkLogTools({ workspaceRootPath: workspaceRoot })
    if (!tools.searchWorkLogs.execute) {
      throw new Error('Expected searchWorkLogs.execute to exist')
    }

    const result = await tools.searchWorkLogs.execute(
      {
        query: 'issues'
      },
      {} as never
    )

    expect(result).toEqual({
      matches: [
        {
          fileName: '2026-03-09.md',
          path: path.join(workspaceRoot, '.tia', 'work-logs', '2026-03-09.md'),
          snippet: 'Reviewed open issues.'
        }
      ]
    })
  })
})

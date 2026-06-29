import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { listDesktopAutomations } from './desktop-automations'

describe('desktop automations', () => {
  let tempRoot = ''

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('reads Codex automation definitions from disk', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-desktop-automations-'))
    const automationDirectory = path.join(tempRoot, 'daily-remote-job-scan')
    await mkdir(automationDirectory, { recursive: true })
    await writeFile(
      path.join(automationDirectory, 'automation.toml'),
      [
        'version = 1',
        'id = "daily-remote-job-scan"',
        'kind = "cron"',
        'name = "Daily remote job scan"',
        'prompt = "Run the job scan.\\nSummarize the results."',
        'status = "ACTIVE"',
        'rrule = "RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=MO,WE,FR"',
        'model = "gpt-5.4"',
        'reasoning_effort = "medium"',
        'execution_environment = "local"',
        'cwds = ["/Users/demo/project"]',
        'created_at = 1781099457929',
        'updated_at = 1781710706120',
        ''
      ].join('\n'),
      'utf8'
    )
    await mkdir(path.join(tempRoot, 'empty-dir'), { recursive: true })

    const automations = await listDesktopAutomations(tempRoot)

    expect(automations).toEqual([
      {
        id: 'daily-remote-job-scan',
        kind: 'cron',
        name: 'Daily remote job scan',
        prompt: 'Run the job scan.\nSummarize the results.',
        status: 'ACTIVE',
        rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=MO,WE,FR',
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        executionEnvironment: 'local',
        cwds: ['/Users/demo/project'],
        createdAt: new Date(1781099457929).toISOString(),
        updatedAt: new Date(1781710706120).toISOString(),
        directoryPath: automationDirectory,
        filePath: path.join(automationDirectory, 'automation.toml')
      }
    ])
  })
})

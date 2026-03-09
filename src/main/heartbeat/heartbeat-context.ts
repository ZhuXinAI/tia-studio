import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { resolveWorkLogsDirectory } from '../cron/work-log-writer'

type BuildHeartbeatWorklogContextInput = {
  workspaceRootPath: string
  intervalMinutes: number
  now?: Date
}

type ParsedWorkLogEntry = {
  occurredAt: Date
  markdown: string
}

function parseWorkLogEntries(content: string): ParsedWorkLogEntry[] {
  const normalizedContent = content.replace(/\r\n/g, '\n')
  const lines = normalizedContent.split('\n')
  const entries: ParsedWorkLogEntry[] = []

  let currentTimestamp: Date | null = null
  let currentEntryLines: string[] = []

  function flushCurrentEntry(): void {
    if (!currentTimestamp || currentEntryLines.length === 0) {
      currentTimestamp = null
      currentEntryLines = []
      return
    }

    entries.push({
      occurredAt: currentTimestamp,
      markdown: currentEntryLines.join('\n').trim()
    })
    currentTimestamp = null
    currentEntryLines = []
  }

  for (const line of lines) {
    const headingMatch = line.match(
      /^## (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)\b/
    )

    if (headingMatch) {
      flushCurrentEntry()
      const occurredAt = new Date(headingMatch[1])
      if (!Number.isFinite(occurredAt.getTime())) {
        continue
      }

      currentTimestamp = occurredAt
      currentEntryLines = [line]
      continue
    }

    if (currentTimestamp) {
      currentEntryLines.push(line)
    }
  }

  flushCurrentEntry()
  return entries
}

async function listWorkLogPaths(workspaceRootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(resolveWorkLogsDirectory(workspaceRootPath), {
      withFileTypes: true
    })

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(resolveWorkLogsDirectory(workspaceRootPath), entry.name))
      .sort((left, right) => right.localeCompare(left))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export async function buildHeartbeatWorklogContext(
  input: BuildHeartbeatWorklogContextInput
): Promise<string | null> {
  const now = input.now ?? new Date()
  const lookbackStart = new Date(now.getTime() - input.intervalMinutes * 60_000)
  const workLogPaths = await listWorkLogPaths(input.workspaceRootPath)
  const entries = (
    await Promise.all(
      workLogPaths.map(async (workLogPath) => {
        const content = await readFile(workLogPath, 'utf8')
        return parseWorkLogEntries(content)
      })
    )
  )
    .flat()
    .filter((entry) => entry.occurredAt > lookbackStart && entry.occurredAt <= now)
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())

  if (entries.length === 0) {
    return null
  }

  return [
    `Recent work-log context from the last ${input.intervalMinutes} minutes.`,
    'Review this durable recent work before deciding whether follow-up is necessary.',
    '',
    ...entries.flatMap((entry) => [entry.markdown, ''])
  ]
    .join('\n')
    .trim()
}

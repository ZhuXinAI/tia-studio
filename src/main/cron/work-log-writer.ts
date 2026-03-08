import path from 'node:path'
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises'

type AppendWorkLogEntryInput = {
  workspaceRootPath: string
  assistantName: string
  cronJobName?: string
  outputText: string
  occurredAt?: Date
}

function formatLogDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function resolveWorkLogsDirectory(workspaceRootPath: string): string {
  return path.join(workspaceRootPath, '.tia', 'work-logs')
}

export function resolveWorkLogPath(workspaceRootPath: string, date: Date = new Date()): string {
  return path.join(resolveWorkLogsDirectory(workspaceRootPath), `${formatLogDate(date)}.md`)
}

async function ensureWorkLogFile(filePath: string, date: Date): Promise<void> {
  try {
    await access(filePath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw error
    }

    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, `# Work Log — ${formatLogDate(date)}\n\n`, 'utf8')
  }
}

export async function appendWorkLogEntry(input: AppendWorkLogEntryInput): Promise<string> {
  const occurredAt = input.occurredAt ?? new Date()
  const filePath = resolveWorkLogPath(input.workspaceRootPath, occurredAt)
  await ensureWorkLogFile(filePath, occurredAt)

  const heading = [
    `## ${occurredAt.toISOString()}`,
    input.assistantName.trim(),
    input.cronJobName?.trim()
  ]
    .filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
    .join(' — ')
  const entryBody = input.outputText.trim()
  const entry = `${heading}\n\n${entryBody}\n\n`

  await appendFile(filePath, entry, 'utf8')
  return filePath
}

import os from 'node:os'
import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import type { DesktopAutomationRecord } from '../../shared/desktop-discovery'

type ParsedAutomationToml = {
  id: string | null
  kind: string | null
  name: string | null
  prompt: string | null
  status: string | null
  rrule: string | null
  model: string | null
  reasoning_effort: string | null
  execution_environment: string | null
  cwds: string[]
  created_at: string | number | null
  updated_at: string | number | null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function parseTomlString(rawValue: string): string | null {
  try {
    const parsed = JSON.parse(rawValue)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return rawValue.slice(1, -1)
  }
}

function parseTomlValue(rawValue: string): unknown {
  const value = rawValue.trim()

  if (value.startsWith('"') && value.endsWith('"')) {
    return parseTomlString(value)
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value)
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return value
}

function parseAutomationToml(content: string): ParsedAutomationToml {
  const record: Record<string, unknown> = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    if (key.length === 0 || rawValue.length === 0) {
      continue
    }

    record[key] = parseTomlValue(rawValue)
  }

  const parsedCwds = Array.isArray(record.cwds)
    ? record.cwds
        .map((entry) => toNonEmptyString(entry))
        .filter((entry): entry is string => entry !== null)
    : []

  return {
    id: toNonEmptyString(record.id),
    kind: toNonEmptyString(record.kind),
    name: toNonEmptyString(record.name),
    prompt: toNonEmptyString(record.prompt),
    status: toNonEmptyString(record.status),
    rrule: toNonEmptyString(record.rrule),
    model: toNonEmptyString(record.model),
    reasoning_effort: toNonEmptyString(record.reasoning_effort),
    execution_environment: toNonEmptyString(record.execution_environment),
    cwds: parsedCwds,
    created_at:
      typeof record.created_at === 'number' || typeof record.created_at === 'string'
        ? record.created_at
        : null,
    updated_at:
      typeof record.updated_at === 'number' || typeof record.updated_at === 'string'
        ? record.updated_at
        : null
  }
}

function normalizeTimestamp(value: string | number | null): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numericValue = Number(value)
    if (Number.isFinite(numericValue) && value.trim() === `${numericValue}`) {
      return new Date(numericValue).toISOString()
    }

    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.valueOf())) {
      return parsedDate.toISOString()
    }
  }

  return null
}

export async function listDesktopAutomations(
  rootPath = path.join(os.homedir(), '.codex', 'automations')
): Promise<DesktopAutomationRecord[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }

  const automations = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directoryPath = path.join(rootPath, entry.name)
        const filePath = path.join(directoryPath, 'automation.toml')

        try {
          const content = await readFile(filePath, 'utf8')
          const parsed = parseAutomationToml(content)

          return {
            id: parsed.id ?? entry.name,
            kind: parsed.kind,
            name: parsed.name ?? entry.name,
            prompt: parsed.prompt,
            status: parsed.status,
            rrule: parsed.rrule,
            model: parsed.model,
            reasoningEffort: parsed.reasoning_effort,
            executionEnvironment: parsed.execution_environment,
            cwds: parsed.cwds,
            createdAt: normalizeTimestamp(parsed.created_at),
            updatedAt: normalizeTimestamp(parsed.updated_at),
            directoryPath,
            filePath
          } satisfies DesktopAutomationRecord
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null
          }

          throw error
        }
      })
  )

  return automations
    .filter((automation): automation is DesktopAutomationRecord => automation !== null)
    .sort((left, right) => {
      const leftValue = left.updatedAt ?? left.createdAt ?? ''
      const rightValue = right.updatedAt ?? right.createdAt ?? ''
      if (leftValue !== rightValue) {
        return rightValue.localeCompare(leftValue)
      }

      return left.name.localeCompare(right.name)
    })
}

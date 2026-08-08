import { randomUUID } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { AgentArtifact, AgentArtifactKind } from '../../shared/artifacts'
import type { AppAgentEvent } from '../../shared/agent-runtime'

const MAX_ARTIFACTS = 12
const MAX_DEPTH = 5
const MAX_PREVIEW_LENGTH = 12_000
const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.html',
  '.htm',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.py',
  '.rs',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml'
])

type Candidate = {
  value: string
  field?: string
  name?: string
  mimeType?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function mimeForPath(path: string): string | undefined {
  const extension = extname(path).toLowerCase()
  const map: Record<string, string> = {
    '.csv': 'text/csv',
    '.css': 'text/css',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.gif': 'image/gif',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.py': 'text/x-python',
    '.svg': 'image/svg+xml',
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.txt': 'text/plain',
    '.webp': 'image/webp',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml'
  }
  return map[extension]
}

function kindForPath(path: string, mimeType?: string): AgentArtifactKind {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.includes('spreadsheet') || mimeType === 'text/csv') return 'spreadsheet'
  if (mimeType?.includes('pdf') || mimeType?.includes('word')) return 'document'
  if (mimeType === 'text/html') return 'webpage'
  if (TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return 'text'
  return 'file'
}

function preview(value: string): string {
  const normalized = value.replaceAll('\u0000', '').trim()
  return normalized.length > MAX_PREVIEW_LENGTH
    ? `${normalized.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`
    : normalized
}

function insideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const path = resolve(candidate)
  const root = resolve(workspaceRoot)
  const pathRelative = relative(root, path)
  return (
    pathRelative === '' ||
    (!pathRelative.startsWith(`..${sep}`) && pathRelative !== '..' && !isAbsolute(pathRelative))
  )
}

function collectCandidates(value: unknown, candidates: Candidate[], depth = 0): void {
  if (candidates.length >= MAX_ARTIFACTS * 2 || depth > MAX_DEPTH) return
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized) candidates.push({ value: normalized })
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCandidates(item, candidates, depth + 1)
    return
  }
  const record = asRecord(value)
  if (!record) return
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string' && item.trim()) {
      if (/^(path|filepath|file_path|filename|url|href|content|text|markdown|html|output)$/i.test(key)) {
        candidates.push({
          value: item.trim(),
          field: key.toLowerCase(),
          name: typeof record.name === 'string' ? record.name.trim() : undefined,
          mimeType:
            typeof record.mimeType === 'string'
              ? record.mimeType
              : typeof record.mime_type === 'string'
                ? record.mime_type
                : undefined
        })
      }
    } else {
      collectCandidates(item, candidates, depth + 1)
    }
  }
}

async function resolveWorkspaceFile(workspaceRoot: string, candidate: string): Promise<string | null> {
  const path = resolve(workspaceRoot, candidate)
  if (!insideWorkspace(workspaceRoot, path)) return null
  try {
    const [rootReal, pathReal] = await Promise.all([realpath(workspaceRoot), realpath(path)])
    return insideWorkspace(rootReal, pathReal) ? pathReal : null
  } catch {
    return null
  }
}

function artifactKey(artifact: Pick<AgentArtifact, 'relativePath' | 'url' | 'previewText'>): string {
  return artifact.relativePath ?? artifact.url ?? artifact.previewText ?? ''
}

export async function extractArtifactsFromToolCompleted(
  event: Extract<AppAgentEvent, { type: 'tool.completed' }>,
  workspaceRoot: string,
  sourceMessageId?: string
): Promise<AgentArtifact[]> {
  if (event.isError) return []
  const candidates: Candidate[] = []
  collectCandidates(event.output, candidates)
  const artifacts: AgentArtifact[] = []
  const workspaceReal = await realpath(workspaceRoot).catch(() => resolve(workspaceRoot))
  const seen = new Set<string>()
  const add = (artifact: Omit<AgentArtifact, 'id' | 'createdAt'>) => {
    if (artifacts.length >= MAX_ARTIFACTS) return
    const key = artifactKey(artifact)
    if (!key || seen.has(key)) return
    seen.add(key)
    artifacts.push({
      ...artifact,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    })
  }

  for (const candidate of candidates) {
    if (isUrl(candidate.value) || candidate.field === 'url' || candidate.field === 'href') {
      if (isUrl(candidate.value)) {
        add({
          sessionId: event.sessionId,
          name: candidate.name || new URL(candidate.value).hostname,
          kind: 'webpage',
          url: candidate.value,
          sourceMessageId,
          sourceToolCallId: event.toolCallId,
          sourceToolName: event.toolName
        })
      }
      continue
    }
    if (!['path', 'filepath', 'file_path', 'filename'].includes(candidate.field ?? '')) continue
    const path = await resolveWorkspaceFile(workspaceRoot, candidate.value)
    if (!path) continue
    const file = await stat(path).catch(() => null)
    if (!file?.isFile()) continue
    const mimeType = candidate.mimeType ?? mimeForPath(path)
    let previewText: string | undefined
    if (mimeType?.startsWith('text/') || TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
      previewText = preview(await readFile(path, 'utf8').catch(() => '')) || undefined
    }
    add({
      sessionId: event.sessionId,
      name: candidate.name || basename(path),
      kind: kindForPath(path, mimeType),
      mimeType,
      relativePath: relative(workspaceReal, path),
      sizeBytes: file.size,
      previewText,
      sourceMessageId,
      sourceToolCallId: event.toolCallId,
      sourceToolName: event.toolName
    })
  }

  if (artifacts.length === 0) {
    const textCandidate = candidates.find((candidate) =>
      ['content', 'text', 'markdown', 'html', 'output'].includes(candidate.field ?? '')
    )
    const fallback = textCandidate?.value ?? (typeof event.output === 'string' ? event.output : '')
    if (preview(fallback)) {
      add({
        sessionId: event.sessionId,
        name: `${event.toolName} output`,
        kind: 'tool-output',
        mimeType: 'text/plain',
        previewText: preview(fallback),
        sourceMessageId,
        sourceToolCallId: event.toolCallId,
        sourceToolName: event.toolName
      })
    }
  }
  return artifacts
}

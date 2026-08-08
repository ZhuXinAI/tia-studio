import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { normalizeBrowserUrl } from '../../shared/browser'
import type { AgentArtifact } from '../../shared/artifacts'
import type { AgentArtifactsRepository } from '../persistence/repos/artifacts-repo'

const MAX_NAME_LENGTH = 160
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

const DELIVERABLE_KINDS = ['file', 'image', 'document', 'spreadsheet', 'webpage', 'text'] as const

type DeliverableKind = (typeof DELIVERABLE_KINDS)[number]

type DeliverableToolOptions = {
  sessionId: string
  workspaceRoot: string
  artifactsRepo: Pick<AgentArtifactsRepository, 'createOrUpdate'>
  sourceMessageId: (toolCallId: string) => string | undefined
  publish: (artifact: AgentArtifact) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replaceAll('\u0000', '').trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate))
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
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

function kindForPath(path: string, mimeType?: string): DeliverableKind {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.includes('spreadsheet') || mimeType === 'text/csv') return 'spreadsheet'
  if (mimeType?.includes('pdf') || mimeType?.includes('word')) return 'document'
  if (mimeType === 'text/html') return 'webpage'
  if (TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return 'text'
  return 'file'
}

function normalizeKind(value: unknown, fallback: DeliverableKind): DeliverableKind {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !DELIVERABLE_KINDS.includes(value as DeliverableKind)) {
    throw new Error(`Deliverable kind must be one of: ${DELIVERABLE_KINDS.join(', ')}`)
  }
  return value as DeliverableKind
}

async function resolveWorkspaceFile(
  workspaceRoot: string,
  candidate: string
): Promise<{ path: string; relativePath: string; sizeBytes: number; mimeType?: string }> {
  const workspaceReal = await realpath(workspaceRoot).catch(() => resolve(workspaceRoot))
  const path = resolve(workspaceRoot, candidate)
  if (!isInside(workspaceRoot, path)) {
    throw new Error('Deliverable file must stay inside the workspace')
  }

  const realPath = await realpath(path).catch(() => null)
  if (!realPath || !isInside(workspaceReal, realPath)) {
    throw new Error('Deliverable file must exist inside the workspace')
  }
  const file = await stat(realPath).catch(() => null)
  if (!file?.isFile()) throw new Error('Deliverable path must point to a file')

  return {
    path: realPath,
    relativePath: relative(workspaceReal, realPath),
    sizeBytes: file.size,
    mimeType: mimeForPath(realPath)
  }
}

function preview(value: string): string | undefined {
  const normalized = value.replaceAll('\u0000', '').trim()
  if (!normalized) return undefined
  return normalized.length > MAX_PREVIEW_LENGTH
    ? `${normalized.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`
    : normalized
}

export function createOrUpdateDeliverableTool(options: DeliverableToolOptions): ToolDefinition {
  return {
    name: 'createOrUpdateDeliverable',
    label: 'Create or update deliverable',
    description:
      'Explicitly publish one user-facing deliverable for this thread. Use this only after you have confirmed the file, URL, or text is the final useful output the user should review.',
    promptSnippet: 'Publish confirmed user-facing outputs with createOrUpdateDeliverable.',
    promptGuidelines: [
      'Only call createOrUpdateDeliverable for an output you have explicitly confirmed as a deliverable; ordinary tool results never become deliverables automatically.',
      'Use a workspace-relative file path, an http(s) URL, or previewText. Reuse the same id when revising an existing deliverable.',
      'After publishing, mention the deliverable by its name and keep the final response concise.'
    ],
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
          description: 'Stable id to update an existing deliverable.'
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_NAME_LENGTH,
          description: 'Human-readable name shown in the deliverables panel.'
        },
        kind: {
          type: 'string',
          enum: DELIVERABLE_KINDS,
          description: 'Deliverable type. It is inferred when omitted.'
        },
        relativePath: {
          type: 'string',
          minLength: 1,
          maxLength: 4_000,
          description: 'A file path relative to the current workspace.'
        },
        url: {
          type: 'string',
          minLength: 1,
          maxLength: 4_000,
          description: 'An http:// or https:// URL.'
        },
        mimeType: {
          type: 'string',
          maxLength: 200,
          description: 'Optional MIME type for the deliverable.'
        },
        previewText: {
          type: 'string',
          maxLength: MAX_PREVIEW_LENGTH,
          description: 'Optional text preview for the deliverable.'
        }
      },
      required: ['name'],
      additionalProperties: false
    } as ToolDefinition['parameters'],
    execute: async (toolCallId, rawParams) => {
      const params = isRecord(rawParams) ? rawParams : {}
      const name = text(params.name, MAX_NAME_LENGTH)
      if (!name) throw new Error('Deliverable name is required')

      const id = text(params.id, 160)
      const relativePathInput = text(params.relativePath, 4_000)
      const urlInput = text(params.url, 4_000)
      const suppliedPreview =
        typeof params.previewText === 'string' ? preview(params.previewText) : undefined
      if (relativePathInput && urlInput) {
        throw new Error('A deliverable can use a file path or URL, not both')
      }
      if (!relativePathInput && !urlInput && !suppliedPreview) {
        throw new Error('A deliverable needs a file path, URL, or non-empty previewText')
      }

      let relativePath: string | undefined
      let url: string | undefined
      let sizeBytes: number | undefined
      let mimeType = text(params.mimeType, 200)
      let previewText = suppliedPreview
      let inferredKind: DeliverableKind = 'text'

      if (relativePathInput) {
        const file = await resolveWorkspaceFile(options.workspaceRoot, relativePathInput)
        relativePath = file.relativePath
        sizeBytes = file.sizeBytes
        mimeType ??= file.mimeType
        inferredKind = kindForPath(file.path, mimeType)
        if (
          !previewText &&
          (mimeType?.startsWith('text/') || TEXT_EXTENSIONS.has(extname(file.path)))
        ) {
          previewText = preview(await readFile(file.path, 'utf8').catch(() => ''))
        }
      } else if (urlInput) {
        url = normalizeBrowserUrl(urlInput) ?? undefined
        if (!url || url === 'about:blank') {
          throw new Error('Deliverable URL must use http:// or https://')
        }
        inferredKind = 'webpage'
      }

      const kind = normalizeKind(params.kind, inferredKind)
      const artifact = await options.artifactsRepo.createOrUpdate({
        ...(id ? { id } : {}),
        sessionId: options.sessionId,
        name,
        kind,
        ...(mimeType ? { mimeType } : {}),
        ...(relativePath ? { relativePath } : {}),
        ...(url ? { url } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        ...(previewText ? { previewText } : {}),
        sourceMessageId: options.sourceMessageId(toolCallId),
        sourceToolCallId: toolCallId,
        sourceToolName: 'createOrUpdateDeliverable'
      })
      await options.publish(artifact)

      return {
        content: [{ type: 'text', text: `Deliverable published: ${artifact.name}` }],
        details: { artifactId: artifact.id, kind: artifact.kind }
      }
    }
  }
}

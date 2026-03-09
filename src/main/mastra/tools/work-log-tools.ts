import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { resolveWorkLogsDirectory } from '../../cron/work-log-writer'
import { createNoArgToolInputSchema } from './tool-schema'

type WorkLogToolsOptions = {
  workspaceRootPath: string
}

type WorkLogEntry = {
  fileName: string
  path: string
}

function getWorkLogsDirectory(workspaceRootPath: string): string {
  return resolveWorkLogsDirectory(workspaceRootPath)
}

async function listWorkLogEntries(workspaceRootPath: string): Promise<WorkLogEntry[]> {
  try {
    const entries = await readdir(getWorkLogsDirectory(workspaceRootPath), { withFileTypes: true })

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => ({
        fileName: entry.name,
        path: path.join(getWorkLogsDirectory(workspaceRootPath), entry.name)
      }))
      .sort((left, right) => right.fileName.localeCompare(left.fileName))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return []
    }

    throw error
  }
}

function resolveRequestedWorkLogPath(workspaceRootPath: string, fileName: string): string {
  const baseDirectory = getWorkLogsDirectory(workspaceRootPath)
  const resolvedPath = path.resolve(baseDirectory, fileName)
  const normalizedBase = `${baseDirectory}${path.sep}`

  if (resolvedPath !== baseDirectory && !resolvedPath.startsWith(normalizedBase)) {
    throw new Error('Work log path must stay within the workspace work-log directory.')
  }

  return resolvedPath
}

function buildSearchSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\r\n/g, '\n')
  const lowerContent = normalizedContent.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchIndex = lowerContent.indexOf(lowerQuery)

  if (matchIndex === -1) {
    return ''
  }

  const lineStart = normalizedContent.lastIndexOf('\n', matchIndex)
  const lineEnd = normalizedContent.indexOf('\n', matchIndex)

  return normalizedContent
    .slice(
      lineStart === -1 ? 0 : lineStart + 1,
      lineEnd === -1 ? normalizedContent.length : lineEnd
    )
    .trim()
}

export function createWorkLogTools(options: WorkLogToolsOptions) {
  const listWorkLogs = createTool({
    id: 'list-work-logs',
    description: 'List available daily work-log markdown files in the assistant workspace.',
    inputSchema: createNoArgToolInputSchema(),
    outputSchema: z.object({
      logs: z.array(
        z.object({
          fileName: z.string(),
          path: z.string()
        })
      )
    }),
    execute: async () => {
      return {
        logs: await listWorkLogEntries(options.workspaceRootPath)
      }
    }
  })

  const readWorkLog = createTool({
    id: 'read-work-log',
    description: 'Read a single daily work-log markdown file by file name.',
    inputSchema: z.object({
      fileName: z.string().min(1)
    }),
    outputSchema: z.object({
      fileName: z.string(),
      path: z.string(),
      content: z.string()
    }),
    execute: async ({ fileName }) => {
      const resolvedPath = resolveRequestedWorkLogPath(options.workspaceRootPath, fileName)
      const content = await readFile(resolvedPath, 'utf8')

      return {
        fileName: path.basename(resolvedPath),
        path: resolvedPath,
        content
      }
    }
  })

  const searchWorkLogs = createTool({
    id: 'search-work-logs',
    description: 'Search daily work-log markdown files for a query string.',
    inputSchema: z.object({
      query: z.string().min(1)
    }),
    outputSchema: z.object({
      matches: z.array(
        z.object({
          fileName: z.string(),
          path: z.string(),
          snippet: z.string()
        })
      )
    }),
    execute: async ({ query }) => {
      const entries = await listWorkLogEntries(options.workspaceRootPath)
      const matches: Array<{
        fileName: string
        path: string
        snippet: string
      }> = []

      for (const entry of entries) {
        const content = await readFile(entry.path, 'utf8')
        const snippet = buildSearchSnippet(content, query)
        if (!snippet) {
          continue
        }

        matches.push({
          fileName: entry.fileName,
          path: entry.path,
          snippet
        })
      }

      return { matches }
    }
  })

  return {
    listWorkLogs,
    readWorkLog,
    searchWorkLogs
  }
}

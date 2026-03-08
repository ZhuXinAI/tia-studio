import path from 'node:path'
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises'
import { createTool } from '@mastra/core/tools'
import type { InputProcessor } from '@mastra/core/processors'
import type { ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { ensureAssistantWorkspaceFiles } from '../assistant-workspace'
import { HEARTBEAT_RUN_CONTEXT_KEY } from '../tool-context'

type SoulMemoryToolsOptions = {
  workspaceRootPath: string
}

type WorkspaceContextProcessorOptions = {
  workspaceRootPath: string
}

function resolveSoulMemoryPath(workspaceRootPath: string): string {
  return path.join(workspaceRootPath, 'SOUL.md')
}

async function readWorkspaceFileIfPresent(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf8')
    const normalizedContent = content.trim()
    return normalizedContent.length > 0 ? normalizedContent : null
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }

    throw error
  }
}

function getRequestSource(context: ToolExecutionContext): string | null {
  const requestContext = context.requestContext
  if (!requestContext) {
    return null
  }

  const messageId = requestContext.get('messageId')
  return typeof messageId === 'string' ? `message:${messageId}` : null
}

async function readSoulMemoryContent(workspaceRootPath: string): Promise<{
  path: string
  content: string
  updatedAt: string
}> {
  await ensureAssistantWorkspaceFiles(workspaceRootPath)
  const soulPath = resolveSoulMemoryPath(workspaceRootPath)
  const [content, fileStats] = await Promise.all([readFile(soulPath, 'utf8'), stat(soulPath)])

  return {
    path: soulPath,
    content,
    updatedAt: fileStats.mtime.toISOString()
  }
}

async function updateSoulMemoryContent(input: {
  workspaceRootPath: string
  content: string
  mode: 'append' | 'overwrite'
  source?: string | null
}): Promise<{
  path: string
  content: string
  updatedAt: string
}> {
  await ensureAssistantWorkspaceFiles(input.workspaceRootPath)
  const soulPath = resolveSoulMemoryPath(input.workspaceRootPath)

  if (input.mode === 'overwrite') {
    const normalizedContent = input.content.endsWith('\n') ? input.content : `${input.content}\n`
    await writeFile(soulPath, normalizedContent, 'utf8')
  } else {
    const lines = [`## Memory Update (${new Date().toISOString()})`]
    if (input.source) {
      lines.push(`Source: ${input.source}`)
    }
    lines.push('', input.content.trim(), '')
    await appendFile(soulPath, `\n${lines.join('\n')}`, 'utf8')
  }

  return readSoulMemoryContent(input.workspaceRootPath)
}

export function createSoulMemoryTools(options: SoulMemoryToolsOptions) {
  const readSoulMemory = createTool({
    id: 'read-soul-memory',
    description:
      'Read the assistant workspace SOUL.md file when you need durable identity, preference, or memory context.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      path: z.string(),
      content: z.string(),
      updatedAt: z.string()
    }),
    execute: async () => readSoulMemoryContent(options.workspaceRootPath)
  })

  const updateSoulMemory = createTool({
    id: 'update-soul-memory',
    description:
      'Update the assistant workspace SOUL.md file. Use append for incremental memory updates and overwrite only when explicitly required.',
    inputSchema: z.object({
      mode: z.enum(['append', 'overwrite']).default('append'),
      content: z.string().min(1)
    }),
    outputSchema: z.object({
      path: z.string(),
      mode: z.enum(['append', 'overwrite']),
      updatedAt: z.string(),
      message: z.string()
    }),
    execute: async ({ content, mode }, context) => {
      const source = getRequestSource(context)
      const result = await updateSoulMemoryContent({
        workspaceRootPath: options.workspaceRootPath,
        content,
        mode,
        source
      })

      return {
        path: result.path,
        mode,
        updatedAt: result.updatedAt,
        message: `SOUL memory updated using ${mode} mode.`
      }
    }
  })

  return {
    readSoulMemory,
    updateSoulMemory
  }
}

export function assistantWorkspaceContextInputProcessor(
  options: WorkspaceContextProcessorOptions
): InputProcessor {
  return {
    id: 'assistant-workspace-context',
    processInput: async ({ messages, systemMessages, requestContext }) => {
      await ensureAssistantWorkspaceFiles(options.workspaceRootPath)

      const fileNames = ['IDENTITY.md', 'SOUL.md', 'MEMORY.md']
      const shouldIncludeHeartbeat =
        typeof requestContext?.get(HEARTBEAT_RUN_CONTEXT_KEY) === 'string'

      if (shouldIncludeHeartbeat) {
        fileNames.push('HEARTBEAT.md')
      }

      const sections = (
        await Promise.all(
          fileNames.map(async (fileName) => {
            const content = await readWorkspaceFileIfPresent(
              path.join(options.workspaceRootPath, fileName)
            )
            return content ? { fileName, content } : null
          })
        )
      ).filter((section): section is { fileName: string; content: string } => section !== null)

      if (sections.length === 0) {
        return { messages, systemMessages }
      }

      const contextPrompt = [
        'Assistant workspace context is loaded from the configured assistant workspace.',
        'Treat these files as durable operating context unless the user overrides them.',
        '',
        ...sections.flatMap((section) => [`## ${section.fileName}`, section.content, ''])
      ]
        .join('\n')
        .trim()

      return {
        messages,
        systemMessages: [
          ...systemMessages,
          {
            role: 'system' as const,
            content: contextPrompt
          }
        ]
      }
    }
  }
}

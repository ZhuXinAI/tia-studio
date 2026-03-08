import path from 'node:path'
import { access, mkdir, writeFile } from 'node:fs/promises'

const assistantWorkspaceTemplates = {
  'IDENTITY.md': `# IDENTITY.md

Stable assistant identity and operating posture.
`,
  'SOUL.md': `# SOUL.md

Durable preferences, instructions, and identity memory.
`,
  'MEMORY.md': `# MEMORY.md

Curated long-term memory for stable facts and decisions.
`,
  'HEARTBEAT.md': `# HEARTBEAT.md

Instructions for proactive or scheduled follow-up behavior.
`
} as const

export const ASSISTANT_WORKSPACE_FILES = Object.keys(assistantWorkspaceTemplates)

async function ensureFile(filePath: string, content: string): Promise<boolean> {
  try {
    await access(filePath)
    return false
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw error
    }
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
  return true
}

export async function ensureAssistantWorkspaceFiles(rootPath: string): Promise<string[]> {
  const normalizedRootPath = path.resolve(rootPath)
  await mkdir(normalizedRootPath, { recursive: true })

  const createdFiles: string[] = []

  for (const fileName of ASSISTANT_WORKSPACE_FILES) {
    const filePath = path.join(normalizedRootPath, fileName)
    const created = await ensureFile(filePath, assistantWorkspaceTemplates[fileName])
    if (created) {
      createdFiles.push(filePath)
    }
  }

  return createdFiles
}

export function resolveAssistantWorkspacePath(rootPath: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath
  }

  return path.resolve(rootPath, filePath)
}

import path from 'node:path'
import { app } from 'electron'

/**
 * Converts a name to snake_case for use in file paths
 */
export function toSnakeCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s-]+/g, '_') // Replace spaces and hyphens with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '') // Trim underscores from start and end
}

/**
 * Resolves the default workspace path for an assistant in the userData directory
 * @param assistantName - The name of the assistant
 * @returns Absolute path to the assistant's workspace directory
 */
export function resolveDefaultAssistantWorkspacePath(assistantName: string): string {
  const userDataPath = app.getPath('userData')
  const snakeCaseName = toSnakeCase(assistantName)
  const workspaceDirName = snakeCaseName || 'unnamed_assistant'

  return path.join(userDataPath, 'assistants', workspaceDirName)
}

/**
 * Creates a workspace config object with the default path
 * @param assistantName - The name of the assistant
 * @returns Workspace config object
 */
export function createDefaultWorkspaceConfig(assistantName: string): Record<string, unknown> {
  return {
    rootPath: resolveDefaultAssistantWorkspacePath(assistantName)
  }
}

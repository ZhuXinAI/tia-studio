import type { InlineExtension } from '@earendil-works/pi-coding-agent'
import { isAbsolute, join, relative, resolve } from 'node:path'

export type PiPermissionDecision = 'allow' | 'approve' | 'block'

const destructive =
  /(^|[;&|]\s*)(sudo\b|doas\b|rm\s+-[^\n]*r[^\n]*f|git\s+reset\s+--hard|git\s+clean\s+-[^\n]*f|mkfs\b|diskutil\s+erase|shutdown\b|reboot\b|kill\s+-9\b)/i
const credential =
  /(^|[/\\])(\.env(?:\.|$)|\.ssh|\.gnupg|credentials?|secrets?|auth\.json|keychain)([/\\]|$)/i
const protectedNames = new Set([
  'tia-studio.db',
  'tia-studio.db-shm',
  'tia-studio.db-wal',
  'ui-config.json',
  'managed-runtimes.json',
  'mcp.json'
])

function isWithin(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

export function classifyPiToolCall(input: {
  toolName: string
  toolPath?: string
  command?: string
  workspacePath: string
  credentialRoot: string
  fullAccess: boolean
}): PiPermissionDecision {
  const toolPath = input.toolPath?.trim() ?? ''
  const command = input.command?.trim() ?? ''
  const resolvedPath = toolPath ? resolve(input.workspacePath, toolPath) : ''
  const protectedPath =
    resolvedPath &&
    isWithin(input.credentialRoot, resolvedPath) &&
    (protectedNames.has(resolvedPath.slice(resolve(input.credentialRoot).length + 1)) ||
      isWithin(join(input.credentialRoot, 'channels'), resolvedPath))

  if (protectedPath || credential.test(toolPath) || credential.test(command)) return 'block'
  if (input.fullAccess) return 'allow'
  if (
    ((input.toolName === 'write' || input.toolName === 'edit') &&
      resolvedPath &&
      !isWithin(input.workspacePath, resolvedPath)) ||
    (input.toolName === 'bash' && destructive.test(command))
  ) {
    return 'approve'
  }
  return 'allow'
}

export function createPiPermissionExtension(input: {
  workspacePath: string
  credentialRoot: string
  fullAccess: boolean
}): InlineExtension {
  return {
    name: 'tia-permissions',
    factory: (pi) => {
      pi.on('tool_call', async (event, context) => {
        const toolInput = (event.input ?? {}) as Record<string, unknown>
        const toolPath =
          typeof toolInput.path === 'string'
            ? toolInput.path
            : typeof toolInput.file_path === 'string'
              ? toolInput.file_path
              : ''
        const command = typeof toolInput.command === 'string' ? toolInput.command : ''
        const decision = classifyPiToolCall({
          toolName: String(event.toolName ?? ''),
          toolPath,
          command,
          ...input
        })
        if (decision === 'block') {
          return { block: true, reason: 'TIA Studio blocked access to credential storage.' }
        }
        if (decision === 'allow') return
        const description =
          event.toolName === 'bash'
            ? `Run destructive command: ${command}`
            : `Write outside the selected workspace: ${toolPath}`
        const confirmed = await context.ui.confirm('Allow risky action?', description)
        if (!confirmed) return { block: true, reason: 'Blocked by user' }
        return undefined
      })
    }
  }
}

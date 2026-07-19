import type { InlineExtension } from '@earendil-works/pi-coding-agent'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { AgentPermissionOutcome } from '../../../shared/agent-runtime'
import {
  analyzePermissionCommand,
  evaluatePermissionRules,
  type PermissionRule,
  type PermissionRuleProposal
} from '../../../shared/permission-rules'

export type PiPermissionDecision = 'allow' | 'approve' | 'block'

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
    input.toolName === 'bash'
  ) {
    return 'approve'
  }
  return 'allow'
}

export function createPiPermissionExtension(input: {
  workspacePath: string
  credentialRoot: string
  fullAccess: boolean
  listWorkspaceRules?: () => Promise<PermissionRule[]>
  saveWorkspaceRules?: (proposals: PermissionRuleProposal[]) => Promise<void>
  touchWorkspaceRules?: (ids: string[]) => Promise<void>
  requestPermission?: (
    analysis: ReturnType<typeof analyzePermissionCommand>
  ) => Promise<AgentPermissionOutcome>
}): InlineExtension {
  const sessionRules: PermissionRule[] = []
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
        if (event.toolName === 'bash') {
          const analysis = analyzePermissionCommand(command)
          const workspaceRules = (await input.listWorkspaceRules?.()) ?? []
          const evaluated = evaluatePermissionRules(analysis, [...workspaceRules, ...sessionRules])
          if (evaluated.decision === 'deny') {
            return { block: true, reason: 'Blocked by a TIA Studio permission rule.' }
          }
          if (input.fullAccess) return
          if (evaluated.decision === 'allow') {
            const persistedIds = evaluated.matchedRuleIds.filter((id) => !id.startsWith('session:'))
            if (persistedIds.length > 0) await input.touchWorkspaceRules?.(persistedIds)
            return
          }

          const outcome = input.requestPermission
            ? await input.requestPermission(analysis)
            : (await context.ui.confirm('Allow this action?', `Run command: ${command}`))
              ? 'allow-once'
              : 'deny'
          if (outcome === 'deny') return { block: true, reason: 'Blocked by user' }
          if (outcome === 'allow-session' && analysis.reusable) {
            const now = new Date().toISOString()
            sessionRules.push(
              ...analysis.proposals.map((proposal, index) => ({
                id: `session:${now}:${index}`,
                workspacePath: input.workspacePath,
                tool: proposal.tool,
                decision: 'allow' as const,
                argvPrefix: proposal.argvPrefix,
                rationale: 'Allowed for this session by the user',
                origin: 'user-approval' as const,
                createdAt: now,
                updatedAt: now
              }))
            )
          }
          if (outcome === 'allow-workspace' && analysis.reusable) {
            await input.saveWorkspaceRules?.(analysis.proposals)
          }
          return
        }
        if (decision === 'allow') return
        const description = `Write outside the selected workspace: ${toolPath}`
        const confirmed = await context.ui.confirm('Allow this action?', description)
        if (!confirmed) return { block: true, reason: 'Blocked by user' }
        return undefined
      })
    }
  }
}

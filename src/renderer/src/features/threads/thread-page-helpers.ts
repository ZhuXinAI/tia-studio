import type { AssistantRecord } from '../assistants/assistants-query'
import type { ProviderRecord } from '../settings/providers/providers-query'
import type { ThreadRecord } from './threads-query'
import { sortThreadsByRecentActivity } from './thread-page-routing'

type ReadinessCheckId = 'workspace' | 'provider' | 'model'
const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'

type ReadinessCheck = {
  id: ReadinessCheckId
  label: string
  ready: boolean
  ctaPath: string
}

export type AssistantReadiness = {
  canChat: boolean
  checks: ReadinessCheck[]
}

export type AssistantThreadBranch = {
  assistantId: string
  assistantName: string
  canDeleteAssistant: boolean
  isSelected: boolean
  threads: ThreadRecord[]
}

function canDeleteAssistant(assistant: AssistantRecord): boolean {
  return assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] !== true
}

export function evaluateAssistantReadiness(input: {
  assistant: AssistantRecord | null
  providers: ProviderRecord[]
}): AssistantReadiness {
  const provider =
    input.assistant && input.assistant.providerId.trim().length > 0
      ? (input.providers.find((item) => item.id === input.assistant?.providerId) ?? null)
      : null
  const providerReady = Boolean(provider)
  const modelReady = Boolean(provider?.selectedModel.trim().length)

  const checks: ReadinessCheck[] = [
    {
      id: 'provider',
      label: 'Provider is assigned to this assistant',
      ready: providerReady,
      ctaPath: '/chat'
    },
    {
      id: 'model',
      label: 'Provider has one selected model',
      ready: modelReady,
      ctaPath: '/chat'
    }
  ]

  return {
    canChat: checks.every((check) => check.ready),
    checks
  }
}

function areThreadsEquivalent(left: ThreadRecord[], right: ThreadRecord[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((thread, index) => {
    const candidate = right[index]
    return (
      thread.id === candidate.id &&
      thread.assistantId === candidate.assistantId &&
      thread.resourceId === candidate.resourceId &&
      thread.title === candidate.title &&
      thread.lastMessageAt === candidate.lastMessageAt &&
      thread.createdAt === candidate.createdAt &&
      thread.updatedAt === candidate.updatedAt
    )
  })
}

export function resolveVisibleThreads(input: {
  currentThreads: ThreadRecord[]
  selectedAssistantId: string | null
  threads: ThreadRecord[]
}): ThreadRecord[] {
  if (!input.selectedAssistantId) {
    return input.currentThreads.length === 0 ? input.currentThreads : []
  }

  const nextThreads = sortThreadsByRecentActivity(input.threads)
  return areThreadsEquivalent(input.currentThreads, nextThreads) ? input.currentThreads : nextThreads
}

export function buildAssistantThreadBranches(input: {
  assistants: AssistantRecord[]
  selectedAssistantId: string | null
  threads: ThreadRecord[]
}): AssistantThreadBranch[] {
  return input.assistants.map((assistant) => {
    const isSelected = assistant.id === input.selectedAssistantId
    return {
      assistantId: assistant.id,
      assistantName: assistant.name,
      canDeleteAssistant: canDeleteAssistant(assistant),
      isSelected,
      threads: isSelected ? input.threads : []
    }
  })
}

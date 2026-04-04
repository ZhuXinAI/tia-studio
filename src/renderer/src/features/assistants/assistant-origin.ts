import type { AssistantOrigin, AssistantRecord } from './assistants-query'

const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'

export type AssistantCollectionTab = 'acp' | 'tia'

export function normalizeAssistantOrigin(origin: AssistantOrigin | undefined): AssistantOrigin {
  return origin ?? 'tia'
}

export function isAcpAssistantOrigin(origin: AssistantOrigin | undefined): boolean {
  return normalizeAssistantOrigin(origin) === 'external-acp'
}

export function getAssistantCollectionTab(
  assistant:
    | Pick<AssistantRecord, 'origin'>
    | {
        origin?: AssistantOrigin
      }
): AssistantCollectionTab {
  return isAcpAssistantOrigin(assistant.origin) ? 'acp' : 'tia'
}

export function isBuiltInDefaultAssistant(
  assistant:
    | Pick<AssistantRecord, 'mcpConfig'>
    | {
        mcpConfig?: Record<string, boolean>
      }
): boolean {
  return assistant.mcpConfig?.[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true
}

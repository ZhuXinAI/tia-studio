import { Agent } from '@mastra/core/agent'
import type { ToolsInput } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { BatchPartsProcessor, PIIDetector, PromptInjectionDetector } from '@mastra/core/processors'
import { Memory } from '@mastra/memory'
import type { BuiltInBrowserController } from '../../built-in-browser-manager'
import { ChannelEventBus } from '../../channels/channel-event-bus'
import type { AssistantCronJobsService } from '../../cron/assistant-cron-jobs-service'
import type { RecentConversation } from '../../heartbeat/recent-conversations'
import type { AppAssistant } from '../../persistence/repos/assistants-repo'
import type { AppMcpServer } from '../../persistence/repos/mcp-servers-repo'
import type { AppProvider } from '../../persistence/repos/providers-repo'
import { createCodingSubagent } from '../coding-agent'
import { resolveModel } from '../model-resolver'
import { AttachmentUploader } from '../processors/attachment-uploader'
import { createBuiltInBrowserTools } from '../tools/built-in-browser-tools'
import { createChannelTools } from '../tools/channel-tools'
import { createCronTools } from '../tools/cron-tools'
import { createMemorySessionTools } from '../tools/memory-session-tools'
import {
  assistantWorkspaceContextInputProcessor,
  createSoulMemoryTools
} from '../tools/soul-memory-tools'
import { createWebFetchTool } from '../tools/web-fetch-tool'
import { createWorkLogTools } from '../tools/work-log-tools'
import { buildAssistantInstructions } from './instructions'
import { resolveMemoryOptions, resolveWorkspaceRootPath, type JsonObject } from './workspace-tools'

const PROMPT_INJECTION_THRESHOLD = 0.8
const PII_THRESHOLD = 0.6

export type ResolvedGuardrailConfig = {
  promptInjectionEnabled: boolean
  piiDetectionEnabled: boolean
  requestedProviderId: string | null
  provider: AppProvider
  source: 'assistant' | 'override'
}

export type AgentRegistrationOptions = {
  channelDeliveryEnabled: boolean
  channelType?: string
  cronToolsEnabled?: boolean
}

export type RegisteredAgentBuild = {
  signature: string
  agent: Agent
}

export function buildAssistantTools(input: {
  assistantId: string
  workspaceRootPath: string | null
  channelDeliveryEnabled: boolean
  cronToolsEnabled: boolean
  resolveKeepBrowserWindowOpen: () => boolean | Promise<boolean>
  resolveShowBrowser: () => boolean | Promise<boolean>
  memory: Pick<Memory, 'deleteThread' | 'getThreadById' | 'listThreads'>
  mcpTools: ToolsInput
  channelEventBus: ChannelEventBus
  builtInBrowserManager?: BuiltInBrowserController
  cronJobService?: Pick<
    AssistantCronJobsService,
    'createCronJob' | 'listAssistantCronJobs' | 'removeAssistantCronJob'
  >
  resolveRecentConversations?: () => Promise<RecentConversation[]>
}): ToolsInput {
  const webFetch = createWebFetchTool({
    resolveKeepBrowserWindowOpen: input.resolveKeepBrowserWindowOpen,
    resolveShowBrowser: input.resolveShowBrowser
  })
  const soulMemoryTools = input.workspaceRootPath
    ? createSoulMemoryTools({ workspaceRootPath: input.workspaceRootPath })
    : {}
  const workLogTools = input.workspaceRootPath
    ? createWorkLogTools({ workspaceRootPath: input.workspaceRootPath })
    : {}
  const cronTools =
    input.workspaceRootPath && input.cronJobService && input.cronToolsEnabled
      ? createCronTools({
          assistantId: input.assistantId,
          cronJobService: input.cronJobService
        })
      : {}
  const channelTools = input.channelDeliveryEnabled
    ? createChannelTools({
        bus: input.channelEventBus,
        workspaceRootPath: input.workspaceRootPath,
        resolveRecentConversations: input.resolveRecentConversations
      })
    : {}
  const memorySessionTools = createMemorySessionTools(input.memory)
  const builtInBrowserTools = input.builtInBrowserManager
    ? createBuiltInBrowserTools({
        controller: input.builtInBrowserManager
      })
    : {}

  return {
    webFetch,
    ...builtInBrowserTools,
    ...soulMemoryTools,
    ...workLogTools,
    ...cronTools,
    ...channelTools,
    ...memorySessionTools,
    ...input.mcpTools
  }
}

export function buildAgentRegistrationSignature(input: {
  assistant: AppAssistant
  provider: AppProvider
  guardrailConfig: ResolvedGuardrailConfig
  enabledMcpServers: Record<string, AppMcpServer>
  registrationOptions: AgentRegistrationOptions
}): string {
  const mcpServersSignature = JSON.stringify(input.enabledMcpServers)

  return [
    input.assistant.id,
    input.assistant.updatedAt,
    input.assistant.instructions,
    input.provider.id,
    input.provider.updatedAt,
    input.provider.type,
    input.provider.selectedModel,
    input.provider.apiHost ?? '',
    JSON.stringify(input.assistant.workspaceConfig ?? {}),
    JSON.stringify(input.assistant.skillsConfig ?? {}),
    JSON.stringify(input.assistant.codingConfig ?? {}),
    JSON.stringify(input.assistant.mcpConfig ?? {}),
    input.assistant.maxSteps,
    JSON.stringify(input.assistant.memoryConfig ?? {}),
    mcpServersSignature,
    input.guardrailConfig.promptInjectionEnabled ? 'prompt-injection:on' : 'prompt-injection:off',
    input.guardrailConfig.piiDetectionEnabled ? 'pii:on' : 'pii:off',
    input.guardrailConfig.requestedProviderId ?? '',
    input.guardrailConfig.source,
    input.guardrailConfig.provider.id,
    input.guardrailConfig.provider.updatedAt,
    input.guardrailConfig.provider.type,
    input.guardrailConfig.provider.selectedModel,
    input.guardrailConfig.provider.apiHost ?? '',
    input.registrationOptions.channelDeliveryEnabled ? 'channel-delivery:on' : 'channel-delivery:off',
    input.registrationOptions.channelType ?? '',
    input.registrationOptions.cronToolsEnabled !== false ? 'cron-tools:on' : 'cron-tools:off'
  ].join('|')
}

export async function buildRegisteredAgent(input: {
  assistant: AppAssistant
  provider: AppProvider
  guardrailConfig: ResolvedGuardrailConfig
  enabledMcpServers: Record<string, AppMcpServer>
  registrationOptions: AgentRegistrationOptions
  isFirstConversation: boolean
  storage: ReturnType<Mastra['getStorage']>
  resolveKeepBrowserWindowOpen: () => boolean | Promise<boolean>
  resolveShowBrowser: () => boolean | Promise<boolean>
  channelEventBus: ChannelEventBus
  buildWorkspace: (workspaceConfig: JsonObject, skillsConfig: JsonObject) => Promise<unknown>
  buildMcpTools: (
    assistantId: string,
    enabledMcpServers: Record<string, AppMcpServer>
  ) => Promise<ToolsInput>
  builtInBrowserManager?: BuiltInBrowserController
  cronJobService?: Pick<
    AssistantCronJobsService,
    'createCronJob' | 'listAssistantCronJobs' | 'removeAssistantCronJob'
  >
  resolveRecentConversations?: () => Promise<RecentConversation[]>
}): Promise<RegisteredAgentBuild> {
  const signature = buildAgentRegistrationSignature({
    assistant: input.assistant,
    provider: input.provider,
    guardrailConfig: input.guardrailConfig,
    enabledMcpServers: input.enabledMcpServers,
    registrationOptions: input.registrationOptions
  })

  const model = resolveModel({
    type: input.provider.type,
    apiKey: input.provider.apiKey,
    apiHost: input.provider.apiHost,
    selectedModel: input.provider.selectedModel
  })
  const guardrailModel = resolveModel({
    type: input.guardrailConfig.provider.type,
    apiKey: input.guardrailConfig.provider.apiKey,
    apiHost: input.guardrailConfig.provider.apiHost,
    selectedModel: input.guardrailConfig.provider.selectedModel
  })
  const memory = new Memory({
    ...(input.storage ? { storage: input.storage } : {}),
    options: {
      ...resolveMemoryOptions(input.assistant.memoryConfig),
      generateTitle: true
    }
  })
  const workspaceRootPath = resolveWorkspaceRootPath(input.assistant.workspaceConfig ?? {})
  const tools = buildAssistantTools({
    assistantId: input.assistant.id,
    workspaceRootPath,
    channelDeliveryEnabled: input.registrationOptions.channelDeliveryEnabled,
    cronToolsEnabled: input.registrationOptions.cronToolsEnabled !== false,
    resolveKeepBrowserWindowOpen: input.resolveKeepBrowserWindowOpen,
    resolveShowBrowser: input.resolveShowBrowser,
    memory,
    mcpTools: await input.buildMcpTools(input.assistant.id, input.enabledMcpServers),
    channelEventBus: input.channelEventBus,
    builtInBrowserManager: input.builtInBrowserManager,
    cronJobService: input.cronJobService,
    resolveRecentConversations: input.resolveRecentConversations
  })
  const currentDateTime = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  })
  const agentInstructions = buildAssistantInstructions({
    baseInstructions: input.assistant.instructions || 'You are a helpful assistant.',
    currentDateTime,
    isFirstConversation: input.isFirstConversation,
    channelDeliveryEnabled: input.registrationOptions.channelDeliveryEnabled,
    channelType: input.registrationOptions.channelType,
    builtInBrowserHandoffAvailable: Boolean(input.builtInBrowserManager)
  })
  const workspace = await input.buildWorkspace(
    input.assistant.workspaceConfig ?? {},
    input.assistant.skillsConfig ?? {}
  )
  const codingAgent = createCodingSubagent({
    assistantId: input.assistant.id,
    assistantName: input.assistant.name,
    workspaceRootPath,
    codingConfig: input.assistant.codingConfig
  })
  const inputProcessors = [
    ...(workspaceRootPath
      ? [assistantWorkspaceContextInputProcessor({ workspaceRootPath })]
      : []),
    ...(input.guardrailConfig.promptInjectionEnabled
      ? [
          new PromptInjectionDetector({
            model: guardrailModel,
            threshold: PROMPT_INJECTION_THRESHOLD,
            strategy: 'warn'
          })
        ]
      : []),
    ...(input.guardrailConfig.piiDetectionEnabled
      ? [
          new PIIDetector({
            model: guardrailModel,
            threshold: PII_THRESHOLD,
            strategy: 'redact',
            redactionMethod: 'mask'
          })
        ]
      : []),
    new AttachmentUploader()
  ]
  const outputProcessors = input.guardrailConfig.piiDetectionEnabled
    ? [
        new BatchPartsProcessor({
          batchSize: 10
        }),
        new PIIDetector({
          model: guardrailModel,
          threshold: PII_THRESHOLD,
          strategy: 'redact',
          redactionMethod: 'mask'
        })
      ]
    : []

  return {
    signature,
    agent: new Agent({
      id: input.assistant.id,
      name: input.assistant.name,
      instructions: agentInstructions,
      model: model as never,
      memory: memory as never,
      ...(workspace ? { workspace: workspace as never } : {}),
      ...(codingAgent ? { agents: { codingAgent } } : {}),
      tools,
      inputProcessors,
      ...(outputProcessors.length > 0 ? { outputProcessors } : {})
    })
  }
}

import { describe, expect, it, vi } from 'vitest'
import type {
  AppAgentEvent,
  AppAgentRuntime,
  AgentSessionSnapshot
} from '../../shared/agent-runtime'
import { ChannelEventBus } from './channel-event-bus'
import { ChannelMessageRouter } from './channel-message-router'

const session: AgentSessionSnapshot = {
  id: 'session-1',
  workspaceId: null,
  workspacePath: '/tmp/chats',
  title: 'Channel · room',
  providerId: 'provider-1',
  provider: 'openai',
  modelId: 'gpt-4o',
  thinkingLevel: 'medium',
  accessMode: 'standard',
  pinned: false,
  status: 'idle',
  isCompacting: false,
  queue: { steering: [], followUps: [] },
  todos: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

describe('ChannelMessageRouter', () => {
  it('uses the bound workspace and falls back to Chats when none is selected', async () => {
    const bus = new ChannelEventBus()
    const listeners = new Set<(event: AppAgentEvent) => void>()
    const createSession = vi.fn(async () => session)
    const runtime: AppAgentRuntime = {
      createSession,
      resumeSession: async () => session,
      closeSession: async () => undefined,
      sendMessage: async (input) => {
        const base = {
          sessionId: input.sessionId,
          source: 'pi-sdk' as const,
          timestamp: new Date().toISOString()
        }
        for (const listener of listeners) {
          listener({
            ...base,
            eventId: 'e1',
            sequence: 1,
            type: 'message.text.delta',
            messageId: 'm',
            contentIndex: 0,
            delta: 'Done'
          })
          listener({ ...base, eventId: 'e2', sequence: 2, type: 'run.settled' })
        }
        return { commandId: 'c', accepted: true, behavior: input.behavior }
      },
      cancelRun: async () => undefined,
      setModel: async () => undefined,
      setThinkingLevel: async () => undefined,
      setAccessMode: async () => undefined,
      renameSession: async () => undefined,
      getSession: async () => session,
      getMessages: async () => [],
      respondToInteraction: async () => undefined,
      subscribe: (_id, listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
    let binding: {
      channelId: string
      remoteChatId: string
      sessionId: string
      createdAt: string
    } | null = null
    const replies: string[] = []
    let boundWorkspaceId: string | null = null
    bus.subscribe('channel.message.send-requested', (event) => {
      if (event.content) replies.push(event.content)
    })
    const router = new ChannelMessageRouter({
      eventBus: bus,
      channelsRepo: {
        getRuntimeById: async () => ({
          id: 'channel',
          type: 'telegram',
          name: 'Channel',
          enabled: true,
          workspaceId: boundWorkspaceId,
          config: {},
          lastError: null,
          createdAt: '',
          updatedAt: ''
        })
      },
      bindingsRepo: {
        getByChannelAndRemoteChat: async () => binding,
        upsert: async (input) => (binding = { ...input, createdAt: '' }),
        delete: async () => {
          binding = null
        }
      },
      providersRepo: {
        list: async () => [
          {
            id: 'provider-1',
            name: 'P',
            type: 'openai',
            apiKey: 'k',
            apiHost: null,
            selectedModel: 'gpt-4o',
            selectedModelContextWindowTokens: null,
            providerModels: null,
            enabled: true,
            supportsVision: true,
            isBuiltIn: false,
            isAdded: true,
            isDefault: true,
            icon: null,
            officialSite: null,
            createdAt: '',
            updatedAt: ''
          }
        ]
      },
      workspacesRepo: {
        getById: async (workspaceId) =>
          workspaceId === 'project'
            ? {
                id: 'project',
                name: 'Project',
                rootPath: '/tmp/project',
                createdAt: '',
                updatedAt: '',
                builtInKind: null,
                isMissing: false
              }
            : null,
        ensureBuiltInChatsWorkspace: async () => ({
          id: 'chats',
          name: 'Chats',
          rootPath: '/tmp/chats',
          createdAt: '',
          updatedAt: '',
          builtInKind: 'chats',
          isMissing: false
        })
      },
      agentRuntime: runtime
    })
    await router.handleInboundEvent({
      eventId: 'in',
      channelId: 'channel',
      channelType: 'telegram',
      message: {
        id: 'msg',
        remoteChatId: 'room',
        senderId: 'user',
        content: 'Do it',
        timestamp: new Date()
      }
    })
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null, accessMode: 'standard' })
    )
    expect(replies).toEqual(['Done'])

    boundWorkspaceId = 'project'
    await router.handleInboundEvent({
      eventId: 'new',
      channelId: 'channel',
      channelType: 'telegram',
      message: {
        id: 'new-message',
        remoteChatId: 'room',
        senderId: 'user',
        content: '/new',
        timestamp: new Date()
      }
    })
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: 'project', workspacePath: '/tmp/project' })
    )
  })
})

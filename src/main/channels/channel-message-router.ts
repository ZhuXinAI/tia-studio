import { randomUUID } from 'node:crypto'
import type { AppAgentRuntime, AppAgentEvent } from '../../shared/agent-runtime'
import { logger } from '../utils/logger'
import type { ChannelSessionBindingsRepository } from '../persistence/repos/channel-session-bindings-repo'
import type { ChannelsRepository } from '../persistence/repos/channels-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { WorkspacesRepository } from '../persistence/repos/workspaces-repo'
import type { ChannelEventBus } from './channel-event-bus'
import type { ChannelMessageReceivedEvent } from './types'

type Options = {
  eventBus: ChannelEventBus
  channelsRepo: Pick<ChannelsRepository, 'getRuntimeById'>
  bindingsRepo: Pick<
    ChannelSessionBindingsRepository,
    'getByChannelAndRemoteChat' | 'upsert' | 'delete'
  >
  providersRepo: Pick<ProvidersRepository, 'list'>
  workspacesRepo: Pick<WorkspacesRepository, 'ensureBuiltInChatsWorkspace'>
  agentRuntime: AppAgentRuntime
}

const STOP_REPLIES = {
  stopped: 'Stopped the current run.',
  idle: 'There is no active run to stop right now.'
}

export class ChannelMessageRouter {
  private unsubscribe: (() => void) | null = null
  private readonly chains = new Map<string, Promise<void>>()

  constructor(private readonly options: Options) {}

  async start(): Promise<void> {
    if (this.unsubscribe) return
    this.unsubscribe = this.options.eventBus.subscribe('channel.message.received', (event) =>
      this.handleInboundEvent(event)
    )
  }

  async stop(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = null
    await Promise.allSettled(this.chains.values())
    this.chains.clear()
  }

  async handleInboundEvent(event: ChannelMessageReceivedEvent): Promise<void> {
    const channel = await this.options.channelsRepo.getRuntimeById(event.channelId)
    if (!channel) return
    const key = `${event.channelId}:${event.message.remoteChatId}`

    if (event.message.content.trim().toLowerCase() === '/stop') {
      const binding = await this.options.bindingsRepo.getByChannelAndRemoteChat(
        event.channelId,
        event.message.remoteChatId
      )
      if (!binding) {
        await this.reply(event, STOP_REPLIES.idle)
        return
      }
      const session = await this.options.agentRuntime
        .getSession(binding.sessionId)
        .catch(() => null)
      if (!session || session.status !== 'running') {
        await this.reply(event, STOP_REPLIES.idle)
        return
      }
      await this.options.agentRuntime.cancelRun(binding.sessionId)
      await this.reply(event, STOP_REPLIES.stopped)
      return
    }

    const previous = this.chains.get(key) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(() => this.processMessage(event, channel.name))
      .catch((error) => {
        logger.error('[ChannelMessageRouter] Pi message failed', error)
        return this.reply(
          event,
          '[Error] Pi could not complete this request. Open the desktop thread for details.'
        )
      })
    this.chains.set(key, next)
    await next
    if (this.chains.get(key) === next) this.chains.delete(key)
  }

  private async processMessage(
    event: ChannelMessageReceivedEvent,
    channelName: string
  ): Promise<void> {
    const isNew = event.message.content.trim().toLowerCase() === '/new'
    if (isNew) {
      const existing = await this.options.bindingsRepo.getByChannelAndRemoteChat(
        event.channelId,
        event.message.remoteChatId
      )
      if (existing) await this.options.agentRuntime.closeSession(existing.sessionId)
      await this.options.bindingsRepo.delete(event.channelId, event.message.remoteChatId)
      await this.createBoundSession(event, channelName)
      await this.reply(event, 'Started a new Pi thread.')
      return
    }

    const sessionId = await this.getOrCreateSessionId(event, channelName)
    const response = await this.sendAndCollect(sessionId, event.message.content)
    await this.reply(event, response || '[Error] Pi completed without a text response.')
  }

  private async getOrCreateSessionId(
    event: ChannelMessageReceivedEvent,
    channelName: string
  ): Promise<string> {
    const binding = await this.options.bindingsRepo.getByChannelAndRemoteChat(
      event.channelId,
      event.message.remoteChatId
    )
    if (binding) {
      const existing = await this.options.agentRuntime
        .getSession(binding.sessionId)
        .catch(() => null)
      if (existing) return existing.id
    }
    return this.createBoundSession(event, channelName)
  }

  private async createBoundSession(
    event: ChannelMessageReceivedEvent,
    channelName: string
  ): Promise<string> {
    const [workspace, providers] = await Promise.all([
      this.options.workspacesRepo.ensureBuiltInChatsWorkspace(),
      this.options.providersRepo.list()
    ])
    const provider =
      providers.find((item) => item.enabled && item.isDefault) ??
      providers.find((item) => item.enabled)
    if (!provider) throw new Error('No enabled provider is configured')
    const session = await this.options.agentRuntime.createSession({
      workspaceId: null,
      workspacePath: workspace.rootPath,
      title: `${channelName} · ${event.message.remoteChatId}`,
      providerId: provider.id,
      provider: provider.type,
      modelId: provider.selectedModel,
      accessMode: 'standard'
    })
    await this.options.bindingsRepo.upsert({
      channelId: event.channelId,
      remoteChatId: event.message.remoteChatId,
      sessionId: session.id
    })
    return session.id
  }

  private async sendAndCollect(sessionId: string, text: string): Promise<string> {
    let output = ''
    let settle!: () => void
    let reject!: (error: Error) => void
    const completed = new Promise<void>((resolve, rejectPromise) => {
      settle = resolve
      reject = rejectPromise
    })
    const unsubscribe = this.options.agentRuntime.subscribe(sessionId, (event: AppAgentEvent) => {
      if (event.type === 'message.text.delta') output += event.delta
      if (event.type === 'run.settled') settle()
      if (event.type === 'run.failed') reject(new Error(event.error))
    })
    const timeout = setTimeout(() => reject(new Error('Pi channel run timed out')), 30 * 60_000)
    try {
      const receipt = await this.options.agentRuntime.sendMessage({
        sessionId,
        text,
        behavior: 'normal'
      })
      if (!receipt.accepted) throw new Error(receipt.error ?? 'Pi rejected the message')
      await completed
      return output.trim()
    } finally {
      clearTimeout(timeout)
      unsubscribe()
    }
  }

  private async reply(event: ChannelMessageReceivedEvent, content: string): Promise<void> {
    await this.options.eventBus.publish('channel.message.send-requested', {
      eventId: randomUUID(),
      channelId: event.channelId,
      channelType: event.channelType,
      remoteChatId: event.message.remoteChatId,
      content
    })
  }
}

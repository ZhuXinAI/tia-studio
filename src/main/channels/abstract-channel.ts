import type { ChannelAdapter, ChannelMessage, ChannelType } from './types'

export abstract class AbstractChannel implements ChannelAdapter {
  onMessage?: (message: ChannelMessage) => Promise<void> | void

  constructor(
    public readonly id: string,
    public readonly type: ChannelType
  ) {}

  protected async emitMessage(message: ChannelMessage): Promise<void> {
    this.acknowledgeMessage?.(message.id)?.catch(() => {})
    await this.onMessage?.(message)
  }

  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  abstract send(remoteChatId: string, message: string): Promise<void>
}

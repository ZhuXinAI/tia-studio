import { createResumableStreamContext } from 'resumable-stream/generic'

type SubscriberCallback = (message: string) => void

class InMemoryResumableStreamBus {
  private readonly kv = new Map<string, string>()
  private readonly expiry = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly channels = new Map<string, Set<SubscriberCallback>>()

  connect(): Promise<void> {
    return Promise.resolve()
  }

  async publish(channel: string, message: string): Promise<number> {
    const listeners = [...(this.channels.get(channel) ?? [])]
    for (const listener of listeners) {
      queueMicrotask(() => listener(message))
    }

    return listeners.length
  }

  async subscribe(channel: string, callback: SubscriberCallback): Promise<number> {
    let listeners = this.channels.get(channel)
    if (!listeners) {
      listeners = new Set()
      this.channels.set(channel, listeners)
    }

    listeners.add(callback)
    return listeners.size
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channels.delete(channel)
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<'OK'> {
    this.kv.set(key, value)

    const existingTimer = this.expiry.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.expiry.delete(key)
    }

    if (options?.EX) {
      const timer = setTimeout(() => {
        this.kv.delete(key)
        this.expiry.delete(key)
      }, options.EX * 1000)
      timer.unref?.()
      this.expiry.set(key, timer)
    }

    return 'OK'
  }

  async get(key: string): Promise<string | null> {
    return this.kv.get(key) ?? null
  }

  async incr(key: string): Promise<number> {
    const currentValue = this.kv.get(key)
    if (currentValue == null) {
      this.kv.set(key, '1')
      return 1
    }

    const parsedValue = Number(currentValue)
    if (!Number.isInteger(parsedValue)) {
      throw new Error('ERR value is not an integer or out of range')
    }

    const nextValue = parsedValue + 1
    this.kv.set(key, String(nextValue))
    return nextValue
  }
}

export class ResumableChatStreams {
  private readonly bus = new InMemoryResumableStreamBus()

  private readonly context = createResumableStreamContext({
    waitUntil: null,
    publisher: this.bus,
    subscriber: this.bus,
    keyPrefix: 'tia-studio-chat'
  })

  async register(chatId: string, stream: ReadableStream<string>): Promise<void> {
    await this.context.createNewResumableStream(chatId, () => stream)
  }

  async resume(chatId: string): Promise<ReadableStream<string> | null> {
    const stream = await this.context.resumeExistingStream(chatId)
    return stream ?? null
  }
}

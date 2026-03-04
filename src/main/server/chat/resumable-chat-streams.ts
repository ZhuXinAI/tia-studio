type ActiveResumableChatStream = {
  chunks: string[]
  subscribers: Set<ReadableStreamDefaultController<string>>
}

export class ResumableChatStreams {
  private readonly activeStreams = new Map<string, ActiveResumableChatStream>()

  register(chatId: string, stream: ReadableStream<string>): void {
    const previous = this.activeStreams.get(chatId)
    if (previous) {
      this.closeSubscribers(previous)
      this.activeStreams.delete(chatId)
    }

    const activeStream: ActiveResumableChatStream = {
      chunks: [],
      subscribers: new Set()
    }
    this.activeStreams.set(chatId, activeStream)

    void this.consumeStream(chatId, stream, activeStream)
  }

  resume(chatId: string): ReadableStream<string> | null {
    const activeStream = this.activeStreams.get(chatId)
    if (!activeStream) {
      return null
    }

    let subscriberController: ReadableStreamDefaultController<string> | null = null
    return new ReadableStream<string>({
      start: (controller) => {
        subscriberController = controller
        for (const chunk of activeStream.chunks) {
          controller.enqueue(chunk)
        }

        activeStream.subscribers.add(controller)
      },
      cancel: () => {
        if (!subscriberController) {
          return
        }
        activeStream.subscribers.delete(subscriberController)
      }
    })
  }

  private async consumeStream(
    chatId: string,
    stream: ReadableStream<string>,
    activeStream: ActiveResumableChatStream
  ): Promise<void> {
    const reader = stream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        activeStream.chunks.push(value)
        for (const subscriber of activeStream.subscribers) {
          try {
            subscriber.enqueue(value)
          } catch {
            activeStream.subscribers.delete(subscriber)
          }
        }
      }
    } catch (error) {
      for (const subscriber of activeStream.subscribers) {
        try {
          subscriber.error(error)
        } catch {
          activeStream.subscribers.delete(subscriber)
        }
      }
    } finally {
      this.closeSubscribers(activeStream)
      if (this.activeStreams.get(chatId) === activeStream) {
        this.activeStreams.delete(chatId)
      }
      reader.releaseLock()
    }
  }

  private closeSubscribers(activeStream: ActiveResumableChatStream): void {
    for (const subscriber of activeStream.subscribers) {
      try {
        subscriber.close()
      } catch (error) {
        void error
      }
    }
    activeStream.subscribers.clear()
  }
}

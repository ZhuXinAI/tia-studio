if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserver {
    observe(): void {
      return undefined
    }

    unobserve(): void {
      return undefined
    }

    disconnect(): void {
      return undefined
    }
  }

  globalThis.ResizeObserver = ResizeObserver
}

export {}

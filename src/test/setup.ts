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

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    globalThis.setTimeout(
      () => callback(typeof performance === 'undefined' ? Date.now() : performance.now()),
      0
    )
}

if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = (handle: number): void => {
    globalThis.clearTimeout(handle)
  }
}

export {}

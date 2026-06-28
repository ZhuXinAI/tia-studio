import { createDesktopBootstrapQueryValue, resetDesktopBootstrapCache } from '../renderer/src/lib/desktop-bootstrap'

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

if (typeof window !== 'undefined') {
  resetDesktopBootstrapCache()
  const queryValue = createDesktopBootstrapQueryValue({
    apiBaseUrl: 'http://127.0.0.1:4769',
    authMode: 'bearer',
    authToken: 'test-token',
    app: {
      name: 'TIA Studio',
      version: '0.3.2',
      platform: 'darwin'
    },
    capabilities: {
      autoUpdate: true,
      managedRuntimes: true,
      nativeDirectoryPicker: true,
      runtimeOnboarding: true
    }
  })
  window.history.replaceState({}, '', `/?desktopBootstrap=${queryValue}`)
}

export {}

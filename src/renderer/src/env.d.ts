/// <reference types="vite/client" />

declare global {
  interface Window {
    tiaDesktop: {
      getConfig: () => Promise<{
        baseUrl: string
        authToken: string
      }>
    }
  }
}

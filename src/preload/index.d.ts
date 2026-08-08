import type { TiaStudioApi } from '../shared/browser'

declare global {
  interface Window {
    tiaStudio?: TiaStudioApi
  }
}

export {}

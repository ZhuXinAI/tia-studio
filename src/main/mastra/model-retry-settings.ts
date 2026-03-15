export const DEFAULT_MODEL_MAX_RETRIES = 2

export function createDefaultModelSettings(): { maxRetries: number } {
  return {
    maxRetries: DEFAULT_MODEL_MAX_RETRIES
  }
}

import type { AgentExecutionOptions } from '@mastra/core/agent'

export function buildOpenAIProviderOptions(input: {
  type: string
  apiHost?: string | null
}): AgentExecutionOptions['providerOptions'] {
  if (input.type !== 'openai-response') {
    return undefined
  }

  return {
    openai: {
      store: false
    }
  }
}

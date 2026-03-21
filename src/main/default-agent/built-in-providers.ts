import type { ProviderType } from '../persistence/repos/providers-repo'

export type BuiltInProviderConfig = {
  id: string
  name: string
  type: ProviderType
  icon: string
  officialSite: string
  apiHost?: string
  defaultModel: string
  supportsVision: boolean
}

export const BUILT_IN_PROVIDERS: BuiltInProviderConfig[] = [
  {
    id: 'built-in-minimax',
    name: 'MiniMax',
    type: 'anthropic',
    icon: 'minimax',
    officialSite: 'https://www.minimaxi.com',
    apiHost: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M2.5',
    supportsVision: true
  },
  {
    id: 'built-in-minimax-coding-plan',
    name: 'MiniMax Coding Plan',
    type: 'anthropic',
    icon: 'minimax',
    officialSite: 'https://www.minimaxi.com',
    apiHost: 'https://api.minimaxi.com/anthropic/v1',
    defaultModel: 'MiniMax-M2.5',
    supportsVision: true
  },
  {
    id: 'built-in-glm',
    name: 'GLM',
    type: 'anthropic',
    icon: 'glm',
    officialSite: 'https://open.bigmodel.cn',
    apiHost: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5',
    supportsVision: false
  },
  {
    id: 'built-in-glm-coding-plan',
    name: 'GLM Coding Plan',
    type: 'anthropic',
    icon: 'glm',
    officialSite: 'https://open.bigmodel.cn',
    apiHost: 'https://open.bigmodel.cn/api/anthropic/v1',
    defaultModel: 'glm-5',
    supportsVision: false
  },
  {
    id: 'built-in-ollama',
    name: 'Ollama',
    type: 'openai',
    icon: 'ollama',
    officialSite: 'https://ollama.com',
    apiHost: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    supportsVision: false
  },
  {
    id: 'built-in-openai',
    name: 'OpenAI',
    type: 'openai-response',
    icon: 'openai',
    officialSite: 'https://platform.openai.com',
    apiHost: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    supportsVision: true
  },
  {
    id: 'built-in-openrouter',
    name: 'OpenRouter',
    type: 'openrouter',
    icon: 'openrouter',
    officialSite: 'https://openrouter.ai',
    apiHost: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    supportsVision: true
  },
  {
    id: 'built-in-anthropic',
    name: 'Anthropic',
    type: 'openai-response',
    icon: 'anthropic',
    officialSite: 'https://www.anthropic.com',
    apiHost: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    supportsVision: true
  },
  {
    id: 'built-in-gemini',
    name: 'Gemini',
    type: 'gemini',
    icon: 'gemini',
    officialSite: 'https://ai.google.dev',
    defaultModel: 'gemini-2.0-flash-exp',
    supportsVision: true
  },
  {
    id: 'built-in-kimi',
    name: 'Kimi',
    type: 'anthropic',
    icon: 'kimi',
    officialSite: 'https://kimi.com',
    apiHost: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    supportsVision: false
  },
  {
    id: 'built-in-kimi-coding-plan',
    name: 'Kimi Coding Plan',
    type: 'anthropic',
    icon: 'kimi',
    officialSite: 'https://kimi.com',
    apiHost: 'https://api.kimi.com/coding/v1',
    defaultModel: 'kimi-k2.5',
    supportsVision: false
  },
  {
    id: 'built-in-codex-acp',
    name: 'Codex',
    type: 'codex-acp',
    icon: 'openai',
    officialSite: 'https://github.com/zed-industries/codex-acp',
    defaultModel: 'default',
    supportsVision: true
  },
  {
    id: 'built-in-claude-agent-acp',
    name: 'Claude Agent',
    type: 'claude-agent-acp',
    icon: 'anthropic',
    officialSite: 'https://github.com/zed-industries/claude-agent-acp',
    defaultModel: 'default',
    supportsVision: true
  }
]

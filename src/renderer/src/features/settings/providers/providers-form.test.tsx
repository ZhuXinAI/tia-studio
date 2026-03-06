import { describe, expect, it } from 'vitest'
import {
  parseProviderModelsInput,
  shouldShowProviderModelsField,
  validateProviderForm
} from './providers-form'

describe('providers form helpers', () => {
  it('requires selected model before submit', () => {
    const errors = validateProviderForm({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      apiHost: '',
      selectedModel: '',
      providerModelsText: '',
      supportsVision: false,
      enabled: true
    })

    expect(errors.selectedModel).toBe('Selected model is required')
  })

  it('shows providerModels field for prebuilt providers and parses list', () => {
    expect(shouldShowProviderModelsField(true)).toBe(true)
    expect(parseProviderModelsInput('MiniMax-M2.5, MiniMax-M2.5-lightning')).toEqual([
      'MiniMax-M2.5',
      'MiniMax-M2.5-lightning'
    ])
  })

  it('hides providerModels field for non-prebuilt providers', () => {
    expect(shouldShowProviderModelsField(false)).toBe(false)
  })
})

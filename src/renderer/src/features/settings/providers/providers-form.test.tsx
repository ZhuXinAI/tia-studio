import { describe, expect, it } from 'vitest'
import {
  parseProviderModelsInput,
  shouldShowProviderModelsField,
  validateProviderForm
} from './providers-form'
import { getVisibleProviderTypeOptions } from './provider-type-options'

describe('providers form helpers', () => {
  it('requires selected model before submit', () => {
    const errors = validateProviderForm(
      {
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'test-key',
        apiHost: '',
        selectedModel: '',
        providerModelsText: '',
        supportsVision: false,
        enabled: true
      },
      'Selected model is required'
    )

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

  it('keeps openrouter out of manual provider options unless already selected', () => {
    expect(getVisibleProviderTypeOptions('models')).not.toContain('openrouter')
    expect(getVisibleProviderTypeOptions('models', 'openrouter')).toContain('openrouter')
  })

  it('keeps ACP harnesses out of model provider options', () => {
    expect(getVisibleProviderTypeOptions('models')).not.toContain('codex-acp')
    expect(getVisibleProviderTypeOptions('models')).not.toContain('claude-agent-acp')
  })

  it('shows ACP harness types on the ACP settings scope', () => {
    expect(getVisibleProviderTypeOptions('acp')).toContain('codex-acp')
    expect(getVisibleProviderTypeOptions('acp')).toContain('claude-agent-acp')
  })
})

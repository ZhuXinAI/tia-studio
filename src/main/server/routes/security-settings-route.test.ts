import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerSecuritySettingsRoute } from './security-settings-route'

describe('security settings route', () => {
  it('returns defaults and eligible providers', async () => {
    const getSettings = vi.fn(async () => ({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: 'missing-provider'
    }))
    const saveSettings = vi.fn(async () => ({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: null
    }))
    const list = vi.fn(async () => [
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai',
        selectedModel: 'gpt-5',
        enabled: true
      },
      {
        id: 'provider-2',
        name: 'Disabled',
        type: 'openai',
        selectedModel: 'gpt-5-mini',
        enabled: false
      },
      {
        id: 'provider-3',
        name: 'No Model',
        type: 'gemini',
        selectedModel: '',
        enabled: true
      }
    ])
    const getById = vi.fn()
    const app = new Hono()

    registerSecuritySettingsRoute(app, {
      securitySettingsRepo: {
        getSettings,
        saveSettings
      } as never,
      providersRepo: {
        list,
        getById
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/security')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: null,
      availableProviders: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          type: 'openai',
          selectedModel: 'gpt-5'
        }
      ]
    })
    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
    expect(saveSettings).not.toHaveBeenCalled()
    expect(getById).not.toHaveBeenCalled()
  })

  it('updates prompt injection setting with validated payload', async () => {
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce({
        promptInjectionEnabled: false,
        piiDetectionEnabled: true,
        guardrailProviderId: null
      })
      .mockResolvedValueOnce({
        promptInjectionEnabled: false,
        piiDetectionEnabled: true,
        guardrailProviderId: null
      })
    const saveSettings = vi.fn(async () => ({
      promptInjectionEnabled: false,
      piiDetectionEnabled: true,
      guardrailProviderId: null
    }))
    const app = new Hono()

    registerSecuritySettingsRoute(app, {
      securitySettingsRepo: {
        getSettings,
        saveSettings
      } as never,
      providersRepo: {
        list: vi.fn(async () => []),
        getById: vi.fn()
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptInjectionEnabled: false })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      promptInjectionEnabled: false,
      piiDetectionEnabled: true,
      guardrailProviderId: null,
      availableProviders: []
    })
    expect(saveSettings).toHaveBeenCalledWith({ promptInjectionEnabled: false })
  })

  it('updates guardrail provider with validated payload', async () => {
    const getSettings = vi.fn(async () => ({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: 'provider-1'
    }))
    const saveSettings = vi.fn(async () => ({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: 'provider-1'
    }))
    const getById = vi.fn(async () => ({
      id: 'provider-1',
      name: 'OpenAI',
      type: 'openai',
      selectedModel: 'gpt-5',
      enabled: true
    }))
    const list = vi.fn(async () => [
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai',
        selectedModel: 'gpt-5',
        enabled: true
      }
    ])
    const app = new Hono()

    registerSecuritySettingsRoute(app, {
      securitySettingsRepo: {
        getSettings,
        saveSettings
      } as never,
      providersRepo: {
        list,
        getById
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardrailProviderId: 'provider-1' })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: 'provider-1',
      availableProviders: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          type: 'openai',
          selectedModel: 'gpt-5'
        }
      ]
    })
    expect(getById).toHaveBeenCalledWith('provider-1')
    expect(saveSettings).toHaveBeenCalledWith({ guardrailProviderId: 'provider-1' })
  })

  it('rejects invalid guardrail providers', async () => {
    const app = new Hono()

    registerSecuritySettingsRoute(app, {
      securitySettingsRepo: {
        getSettings: vi.fn(async () => ({
          promptInjectionEnabled: true,
          piiDetectionEnabled: true,
          guardrailProviderId: null
        })),
        saveSettings: vi.fn()
      } as never,
      providersRepo: {
        list: vi.fn(async () => []),
        getById: vi.fn(async () => ({
          id: 'provider-2',
          name: 'Disabled',
          type: 'openai',
          selectedModel: 'gpt-5-mini',
          enabled: false
        }))
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardrailProviderId: 'provider-2' })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Guardrail provider must be enabled and have a selected model'
    })
  })

  it('rejects empty patch payloads', async () => {
    const app = new Hono()

    registerSecuritySettingsRoute(app, {
      securitySettingsRepo: {
        getSettings: vi.fn(async () => ({
          promptInjectionEnabled: true,
          piiDetectionEnabled: true,
          guardrailProviderId: null
        })),
        saveSettings: vi.fn()
      } as never,
      providersRepo: {
        list: vi.fn(async () => []),
        getById: vi.fn()
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'At least one security setting must be provided'
    })
  })
})

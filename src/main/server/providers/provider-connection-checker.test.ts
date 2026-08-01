import { describe, expect, it, vi } from 'vitest'
import { testProviderConnection, type ProviderConnectionInput } from './provider-connection-checker'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function input(overrides: Partial<ProviderConnectionInput>): ProviderConnectionInput {
  return {
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://provider.test/v1',
    selectedModel: 'test-model',
    ...overrides
  }
}

describe('testProviderConnection', () => {
  it('sends a real OpenAI-compatible chat completion with thinking disabled for DeepSeek', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        model: 'deepseek-v4-flash',
        max_tokens: 16,
        temperature: 0,
        stream: false,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: 'Reply with exactly: hi' }]
      })
      return jsonResponse({ choices: [{ message: { content: 'hi' } }] })
    })

    await expect(
      testProviderConnection(input({ selectedModel: 'deepseek-v4-flash' }), { fetcher })
    ).resolves.toEqual({ reply: 'hi' })

    expect(fetcher).toHaveBeenCalledWith(
      'https://provider.test/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it.each([
    {
      name: 'OpenAI Responses',
      provider: input({ type: 'openai-response' }),
      url: 'https://provider.test/v1/responses',
      payload: { output_text: 'hi' },
      assertBody: (body: Record<string, unknown>) =>
        expect(body).toMatchObject({
          model: 'test-model',
          input: 'Reply with exactly: hi',
          max_output_tokens: 16
        })
    },
    {
      name: 'Anthropic Messages',
      provider: input({ type: 'anthropic' }),
      url: 'https://provider.test/v1/messages',
      payload: { content: [{ type: 'text', text: 'hi' }] },
      assertBody: (body: Record<string, unknown>) =>
        expect(body).toMatchObject({
          model: 'test-model',
          max_tokens: 16,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: 'Reply with exactly: hi' }]
        })
    },
    {
      name: 'Gemini',
      provider: input({ type: 'gemini' }),
      url: 'https://provider.test/v1/models/test-model:generateContent?key=test-key',
      payload: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
      assertBody: (body: Record<string, unknown>) =>
        expect(body).toMatchObject({
          contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: hi' }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 16,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
    },
    {
      name: 'Ollama',
      provider: input({ type: 'ollama', apiKey: '', apiHost: 'http://127.0.0.1:11434' }),
      url: 'http://127.0.0.1:11434/api/chat',
      payload: { message: { content: 'hi' } },
      assertBody: (body: Record<string, unknown>) =>
        expect(body).toMatchObject({
          model: 'test-model',
          stream: false,
          think: false,
          options: { temperature: 0, num_predict: 16 }
        })
    }
  ])('runs a real smoke request for $name', async ({ provider, url, payload, assertBody }) => {
    const fetcher = vi.fn(async (_requestUrl: string, init?: RequestInit) => {
      assertBody(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return jsonResponse(payload)
    })

    await expect(testProviderConnection(provider, { fetcher })).resolves.toEqual({ reply: 'hi' })
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'POST' }))
  })

  it('returns the provider error without exposing a huge raw response', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            message: `${'invalid thinking parameter '.repeat(30)}sk-secret-should-not-be-useful`
          }
        },
        400
      )
    )

    await expect(
      testProviderConnection(input({ selectedModel: 'deepseek-v4-flash' }), { fetcher })
    ).rejects.toThrow(/invalid thinking parameter/)
    await expect(
      testProviderConnection(input({ selectedModel: 'deepseek-v4-flash' }), { fetcher })
    ).rejects.toThrow(/…/)
  })

  it('fails when a successful response contains no generated text', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ choices: [{ message: { content: null } }] }))

    await expect(testProviderConnection(input({}), { fetcher })).rejects.toThrow(
      'Provider returned no text for the smoke test.'
    )
  })
})

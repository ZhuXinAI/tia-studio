import { createTool } from '@mastra/core/tools'
import { RequestContext } from '@mastra/core/request-context'
import { makeCoreTool } from '@mastra/core/utils'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { resolveModel } from '../model-resolver'
import { createNoArgToolInputSchema } from './tool-schema'

describe('tool schema helpers', () => {
  it('keeps no-arg tool schemas as a root object for OpenAI Responses', () => {
    const model = resolveModel({
      type: 'openai-response',
      apiKey: 'test-key',
      selectedModel: 'gpt-4.1'
    })

    const coreTool = makeCoreTool(
      createTool({
        id: 'no-arg-test-tool',
        description: 'Test tool.',
        inputSchema: createNoArgToolInputSchema(),
        outputSchema: z.object({
          ok: z.boolean()
        }),
        execute: async () => ({ ok: true })
      }),
      {
        name: 'noArgTestTool',
        model,
        requestContext: new RequestContext()
      },
      'tool'
    )

    const parameters =
      typeof coreTool.parameters === 'object' &&
      coreTool.parameters !== null &&
      'jsonSchema' in coreTool.parameters
        ? coreTool.parameters.jsonSchema
        : coreTool.parameters

    expect(parameters).toMatchObject({
      type: 'object',
      properties: {},
      additionalProperties: false
    })
    expect(parameters).not.toHaveProperty('anyOf')
  })

  it('builds tool schemas for codex-acp default models without crashing', () => {
    const model = resolveModel(
      {
        type: 'codex-acp',
        apiKey: '',
        selectedModel: 'default'
      },
      {
        acpProviderFactory: vi.fn(() => ({
          languageModel: vi.fn(() => ({
            specificationVersion: 'v3' as const,
            provider: 'acp',
            modelId: undefined,
            supportedUrls: {},
            doGenerate: vi.fn(),
            doStream: vi.fn()
          }))
        }))
      }
    )

    const buildCoreTool = () =>
      makeCoreTool(
        createTool({
          id: 'codex-acp-default-tool',
          description: 'Test tool.',
          inputSchema: z.object({
            query: z.string()
          }),
          outputSchema: z.object({
            ok: z.boolean()
          }),
          execute: async () => ({ ok: true })
        }),
        {
          name: 'codexAcpDefaultTool',
          model,
          requestContext: new RequestContext()
        },
        'tool'
      )

    expect(buildCoreTool).not.toThrow()
  })
})

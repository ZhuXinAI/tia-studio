import { createTool } from '@mastra/core/tools'
import { RequestContext } from '@mastra/core/request-context'
import { makeCoreTool } from '@mastra/core/utils'
import { describe, expect, it } from 'vitest'
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
})

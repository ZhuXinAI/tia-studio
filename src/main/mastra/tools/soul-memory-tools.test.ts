import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { RequestContext } from '@mastra/core/request-context'
import { makeCoreTool } from '@mastra/core/utils'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureAssistantWorkspaceFiles } from '../assistant-workspace'
import { resolveModel } from '../model-resolver'
import { HEARTBEAT_RUN_CONTEXT_KEY } from '../tool-context'
import { assistantWorkspaceContextInputProcessor, createSoulMemoryTools } from './soul-memory-tools'

describe('soul memory tools', () => {
  let workspaceRoot: string | null = null

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = null
    }
  })

  it('reads soul memory from the assistant workspace', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-soul-tools-'))
    await ensureAssistantWorkspaceFiles(workspaceRoot)
    await writeFile(path.join(workspaceRoot, 'SOUL.md'), '# SOUL.md\n\nRemember this.\n', 'utf8')

    const tools = createSoulMemoryTools({ workspaceRootPath: workspaceRoot })
    if (!tools.readSoulMemory.execute) {
      throw new Error('Expected readSoulMemory.execute to exist')
    }

    const result = await tools.readSoulMemory.execute({}, {} as never)

    expect(result).toMatchObject({
      path: path.join(workspaceRoot, 'SOUL.md'),
      content: '# SOUL.md\n\nRemember this.\n'
    })
  })

  it('updates soul memory using append and overwrite modes', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-soul-tools-'))
    await ensureAssistantWorkspaceFiles(workspaceRoot)

    const tools = createSoulMemoryTools({ workspaceRootPath: workspaceRoot })
    if (!tools.updateSoulMemory.execute) {
      throw new Error('Expected updateSoulMemory.execute to exist')
    }

    await tools.updateSoulMemory.execute(
      {
        mode: 'append',
        content: 'First durable note'
      },
      {} as never
    )

    await expect(readFile(path.join(workspaceRoot, 'SOUL.md'), 'utf8')).resolves.toContain(
      'First durable note'
    )

    await tools.updateSoulMemory.execute(
      {
        mode: 'overwrite',
        content: '# SOUL.md\n\nFinal state.\n'
      },
      {} as never
    )

    await expect(readFile(path.join(workspaceRoot, 'SOUL.md'), 'utf8')).resolves.toBe(
      '# SOUL.md\n\nFinal state.\n'
    )
  })

  it('keeps the readSoulMemory input schema as a root object for OpenAI Responses', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-soul-tools-'))
    const tools = createSoulMemoryTools({ workspaceRootPath: workspaceRoot })
    const model = resolveModel({
      type: 'openai-response',
      apiKey: 'test-key',
      selectedModel: 'gpt-4.1'
    })
    const coreTool = makeCoreTool(
      tools.readSoulMemory,
      {
        name: 'readSoulMemory',
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

  it('injects identity, soul, and memory files into system context', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-soul-tools-'))
    await ensureAssistantWorkspaceFiles(workspaceRoot)
    await writeFile(path.join(workspaceRoot, 'IDENTITY.md'), '# IDENTITY.md\n\nIdentity\n', 'utf8')
    await writeFile(path.join(workspaceRoot, 'SOUL.md'), '# SOUL.md\n\nSoul\n', 'utf8')
    await writeFile(path.join(workspaceRoot, 'MEMORY.md'), '# MEMORY.md\n\nMemory\n', 'utf8')
    await writeFile(
      path.join(workspaceRoot, 'HEARTBEAT.md'),
      '# HEARTBEAT.md\n\nHeartbeat\n',
      'utf8'
    )

    const processor = assistantWorkspaceContextInputProcessor({ workspaceRootPath: workspaceRoot })

    const result = await processor.processInput?.({
      messages: [],
      systemMessages: [],
      state: {},
      retryCount: 0,
      messageList: {} as never,
      requestContext: new RequestContext(),
      abort: () => {
        throw new Error('abort should not be called')
      }
    })

    if (!result || !('systemMessages' in result)) {
      throw new Error('Expected processor to return systemMessages')
    }

    const output = result as { systemMessages: Array<{ content: unknown }> }
    const systemContent = output.systemMessages.map((message) => String(message.content)).join('\n')

    expect(systemContent).toContain('## IDENTITY.md')
    expect(systemContent).toContain('Identity')
    expect(systemContent).toContain('## SOUL.md')
    expect(systemContent).toContain('Soul')
    expect(systemContent).toContain('## MEMORY.md')
    expect(systemContent).toContain('Memory')
    expect(systemContent).not.toContain('## HEARTBEAT.md')
  })

  it('injects heartbeat instructions only for heartbeat runs', async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-soul-tools-'))
    await ensureAssistantWorkspaceFiles(workspaceRoot)
    await writeFile(
      path.join(workspaceRoot, 'HEARTBEAT.md'),
      '# HEARTBEAT.md\n\nHeartbeat\n',
      'utf8'
    )

    const requestContext = new RequestContext()
    requestContext.set(HEARTBEAT_RUN_CONTEXT_KEY, 'heartbeat-1')

    const processor = assistantWorkspaceContextInputProcessor({ workspaceRootPath: workspaceRoot })
    const result = await processor.processInput?.({
      messages: [],
      systemMessages: [],
      state: {},
      retryCount: 0,
      messageList: {} as never,
      requestContext,
      abort: () => {
        throw new Error('abort should not be called')
      }
    })

    if (!result || !('systemMessages' in result)) {
      throw new Error('Expected processor to return systemMessages')
    }

    const output = result as { systemMessages: Array<{ content: unknown }> }
    const systemContent = output.systemMessages.map((message) => String(message.content)).join('\n')
    expect(systemContent).toContain('## HEARTBEAT.md')
    expect(systemContent).toContain('Heartbeat')
  })
})

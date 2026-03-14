import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodingSubagent, DEFAULT_ASSISTANT_CODING_MODEL } from './coding-agent'

const { agentConfigs, codexAppServerMock } = vi.hoisted(() => ({
  agentConfigs: [] as Record<string, unknown>[],
  codexAppServerMock: vi.fn((model: string, options: Record<string, unknown>) => ({
    model,
    options
  }))
}))

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    description?: string
    id?: string
    name?: string
    model?: unknown

    constructor(config: Record<string, unknown>) {
      agentConfigs.push(config)
      Object.assign(this, config)
    }
  }
}))

vi.mock('ai-sdk-provider-codex-cli', () => ({
  codexAppServer: (model: string, options: Record<string, unknown>) =>
    codexAppServerMock(model, options)
}))

describe('createCodingSubagent', () => {
  beforeEach(() => {
    agentConfigs.length = 0
    codexAppServerMock.mockClear()
  })

  it('includes the resolved coding workspace in the subagent description', () => {
    const workspaceRootPath = path.resolve('/Users/demo/workspace')
    const cwd = path.resolve(workspaceRootPath, 'app')
    const sharedDir = path.resolve(cwd, '../shared')
    const toolsDir = path.resolve('/opt/tools')
    const agent = createCodingSubagent({
      assistantId: 'assistant-1',
      assistantName: 'TIA',
      workspaceRootPath: '/Users/demo/workspace',
      codingConfig: {
        enabled: true,
        cwd: 'app',
        addDirs: ['../shared', '/opt/tools']
      }
    }) as
      | {
          description?: string
        }
      | undefined

    expect(agent).toBeDefined()
    expect(agent?.description).toContain(`Primary working directory: ${cwd}.`)
    expect(agent?.description).toContain(`Assistant workspace root: ${workspaceRootPath}.`)
    expect(agent?.description).toContain(`Can also access: ${sharedDir}, ${toolsDir}.`)
    expect(agentConfigs.at(-1)?.instructions).toContain('remote debugging port 10531')
    expect(agentConfigs.at(-1)?.instructions).toContain('recommend installing agent-browser')
    expect(codexAppServerMock).toHaveBeenCalledWith(DEFAULT_ASSISTANT_CODING_MODEL, {
      cwd,
      addDirs: [sharedDir, toolsDir]
    })
  })

  it('falls back to the assistant workspace root when no coding cwd is configured', () => {
    const workspaceRootPath = path.resolve('/Users/demo/workspace')
    const agent = createCodingSubagent({
      assistantId: 'assistant-1',
      assistantName: 'TIA',
      workspaceRootPath: '/Users/demo/workspace',
      codingConfig: {
        enabled: true
      }
    }) as
      | {
          description?: string
        }
      | undefined

    expect(agent).toBeDefined()
    expect(agent?.description).toContain(`Primary working directory: ${workspaceRootPath}.`)
    expect(agent?.description).not.toContain('Assistant workspace root:')
    expect(agentConfigs.at(-1)?.instructions).toContain('TIA provides a built-in Electron browser')
    expect(codexAppServerMock).toHaveBeenCalledWith(DEFAULT_ASSISTANT_CODING_MODEL, {
      cwd: workspaceRootPath
    })
  })
})

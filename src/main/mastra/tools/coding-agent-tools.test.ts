import { describe, expect, it, vi } from 'vitest'
import { createCodingAgentDelegateTool } from './coding-agent-tools'

describe('coding agent delegate tool', () => {
  it('fails fast when the task references paths outside the configured workspace', async () => {
    const mastra = {
      getAgent: vi.fn()
    }
    const tool = createCodingAgentDelegateTool({
      codingAgents: [
        {
          target: 'codex-acp',
          agentName: 'coding-agent',
          providerName: 'Codex'
        }
      ],
      workspaceRootPath: '/Users/test/workspace'
    })

    if (!tool.execute) {
      throw new Error('coding agent tool execute function is not defined')
    }

    await expect(
      tool.execute(
        {
          task: 'Go inspect /Users/test/other-project and summarize it.',
          target: 'codex-acp'
        },
        {
          mastra
        } as never
      )
    ).rejects.toThrow(/scoped to workspace/)

    expect(mastra.getAgent).not.toHaveBeenCalled()
  })

  it('delegates normally when the task stays inside the configured workspace', async () => {
    const streamText = Promise.resolve('done')
    const agent = {
      stream: vi.fn(async () => ({
        text: streamText
      }))
    }
    const mastra = {
      getAgent: vi.fn(() => agent)
    }
    const tool = createCodingAgentDelegateTool({
      codingAgents: [
        {
          target: 'codex-acp',
          agentName: 'coding-agent',
          providerName: 'Codex'
        }
      ],
      workspaceRootPath: '/Users/test/workspace'
    })

    if (!tool.execute) {
      throw new Error('coding agent tool execute function is not defined')
    }

    const result = await tool.execute(
      {
        task: 'Review /Users/test/workspace/packages/app/package.json and summarize it.',
        target: 'codex-acp'
      },
      {
        mastra
      } as never
    )

    expect(agent.stream).toHaveBeenCalled()
    expect(result).toMatchObject({
      text: 'done',
      providerName: 'Codex',
      target: 'codex-acp'
    })
  })
})

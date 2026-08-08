import { describe, expect, it, vi } from 'vitest'
import { createBrowserSubagentTool } from './browser-subagent'

describe('browser subagent delegation tool', () => {
  it('delegates the complete task and returns a bounded specialist summary', async () => {
    const run = vi.fn(async ({ task }: { task: string }) => ({
      text: `Completed: ${task}`,
      toolCalls: ['browser_open', 'browser_inspect', 'browser_screenshot']
    }))
    const tool = createBrowserSubagentTool(run)

    const result = await tool.execute(
      'tool-call',
      { task: 'Open example.com and inspect the page' } as never,
      undefined,
      undefined,
      undefined as never
    )

    expect(run).toHaveBeenCalledWith({
      task: 'Open example.com and inspect the page',
      signal: undefined
    })
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Completed: Open example.com and inspect the page')
      })
    )
    expect(result.content[0]).toEqual(
      expect.objectContaining({ text: expect.stringContaining('browser_screenshot') })
    )
    expect(result.details).toEqual(
      expect.objectContaining({
        delegated: true,
        toolCalls: ['browser_open', 'browser_inspect', 'browser_screenshot']
      })
    )
  })

  it('rejects an empty delegation task before invoking the runner', async () => {
    const run = vi.fn()
    const tool = createBrowserSubagentTool(run)

    await expect(
      tool.execute('tool-call', { task: '   ' } as never, undefined, undefined, undefined as never)
    ).rejects.toThrow('task is required')
    expect(run).not.toHaveBeenCalled()
  })
})

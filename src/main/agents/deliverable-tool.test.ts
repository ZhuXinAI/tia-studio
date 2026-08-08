import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentArtifact } from '../../shared/artifacts'
import { createOrUpdateDeliverableTool } from './deliverable-tool'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

function createTool(workspaceRoot: string) {
  const published: AgentArtifact[] = []
  const createOrUpdate = vi.fn(
    async (input: Omit<AgentArtifact, 'id' | 'createdAt'> & { id?: string }) => {
      const artifact: AgentArtifact = {
        ...input,
        id: input.id ?? 'generated-id',
        createdAt: '2026-08-08T00:00:00.000Z'
      }
      return artifact
    }
  )
  const tool = createOrUpdateDeliverableTool({
    sessionId: 'session-1',
    workspaceRoot,
    artifactsRepo: { createOrUpdate },
    sourceMessageId: () => 'message-1',
    publish: async (artifact) => {
      published.push(artifact)
    }
  })
  return { tool, createOrUpdate, published }
}

async function execute(tool: ReturnType<typeof createOrUpdateDeliverableTool>, params: unknown) {
  return tool.execute('tool-call-1', params, undefined, undefined, undefined as never)
}

describe('createOrUpdateDeliverable tool', () => {
  it('publishes a confirmed workspace file and its preview', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tia-deliverable-tool-'))
    directories.push(workspaceRoot)
    await writeFile(join(workspaceRoot, 'summary.md'), '# Final summary\n', 'utf8')
    const { tool, createOrUpdate, published } = createTool(workspaceRoot)

    await execute(tool, { name: 'Summary', relativePath: 'summary.md' })

    expect(createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        name: 'Summary',
        kind: 'text',
        relativePath: 'summary.md',
        previewText: '# Final summary',
        sourceMessageId: 'message-1',
        sourceToolCallId: 'tool-call-1',
        sourceToolName: 'createOrUpdateDeliverable'
      })
    )
    expect(published).toHaveLength(1)
  })

  it('normalizes an explicit URL and allows stable updates', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tia-deliverable-tool-'))
    directories.push(workspaceRoot)
    const { tool, createOrUpdate } = createTool(workspaceRoot)

    await execute(tool, {
      id: 'ai-news',
      name: 'AI news',
      url: 'news.example.com'
    })

    expect(createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ai-news',
        kind: 'webpage',
        url: 'https://news.example.com/'
      })
    )
  })

  it('rejects paths outside the workspace and empty deliverables', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tia-deliverable-tool-'))
    directories.push(workspaceRoot)
    const { tool } = createTool(workspaceRoot)

    await expect(execute(tool, { name: 'Outside', relativePath: '../outside.md' })).rejects.toThrow(
      'inside the workspace'
    )
    await expect(execute(tool, { name: 'Empty' })).rejects.toThrow(
      'file path, URL, or non-empty previewText'
    )
  })
})

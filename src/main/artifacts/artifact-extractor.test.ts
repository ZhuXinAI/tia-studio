import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppAgentEvent } from '../../shared/agent-runtime'
import { extractArtifactsFromToolCompleted } from './artifact-extractor'
import { removeTestDirectory } from '../../test/remove-test-directory'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(removeTestDirectory))
})

function event(output: unknown, isError = false): Extract<AppAgentEvent, { type: 'tool.completed' }> {
  return {
    eventId: 'event-1',
    sessionId: 'session-1',
    sequence: 1,
    timestamp: '2026-08-08T00:00:00.000Z',
    source: 'pi-sdk',
    type: 'tool.completed',
    toolCallId: 'tool-1',
    toolName: 'bash',
    output,
    isError
  }
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tia-artifacts-'))
  directories.push(root)
  await mkdir(join(root, 'reports'))
  await writeFile(join(root, 'reports', 'summary.md'), '# Summary\n\nAll good.')
  return root
}

describe('artifact extractor', () => {
  it('extracts workspace files, safe previews, and URLs from tool output', async () => {
    const root = await workspace()
    const artifacts = await extractArtifactsFromToolCompleted(
      event({
        files: [{ path: 'reports/summary.md' }],
        url: 'https://example.com/report'
      }),
      root,
      'message-1'
    )

    expect(artifacts).toHaveLength(2)
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'text',
          relativePath: join('reports', 'summary.md'),
          previewText: '# Summary\n\nAll good.',
          sourceMessageId: 'message-1'
        }),
        expect.objectContaining({ kind: 'webpage', url: 'https://example.com/report' })
      ])
    )
  })

  it('does not expose paths outside the workspace', async () => {
    const root = await workspace()
    const artifacts = await extractArtifactsFromToolCompleted(
      event({ path: '../outside.txt' }),
      root
    )

    expect(artifacts).toEqual([])
  })

  it('keeps a bounded tool-output preview when no file is present', async () => {
    const root = await workspace()
    const artifacts = await extractArtifactsFromToolCompleted(event('x'.repeat(20_000)), root)

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.kind).toBe('tool-output')
    expect(artifacts[0]?.previewText?.length).toBe(12_000)
  })

  it('ignores failed tool executions', async () => {
    const root = await workspace()
    await expect(
      extractArtifactsFromToolCompleted(event({ content: 'secret' }, true), root)
    ).resolves.toEqual([])
  })
})

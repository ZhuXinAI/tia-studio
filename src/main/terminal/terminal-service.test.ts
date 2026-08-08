import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { removeTestDirectory } from '../../test/remove-test-directory'
import { TerminalService } from './terminal-service'

let directory: string | undefined
let service: TerminalService | undefined

afterEach(async () => {
  await service?.stopAll()
  service = undefined
  if (directory) await removeTestDirectory(directory)
  directory = undefined
})

async function waitForExit(id: string): Promise<ReturnType<TerminalService['get']>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = service?.get(id)
    if (run && run.status !== 'running') return run
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('terminal run did not finish')
}

describe('TerminalService', () => {
  it('runs a command in the workspace and captures output', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-terminal-'))
    service = new TerminalService()
    const run = await service.start({
      sessionId: 'session-1',
      workspacePath: directory,
      command: 'printf terminal-ok'
    })

    const finished = await waitForExit(run.id)
    expect(finished).toEqual(
      expect.objectContaining({ status: 'exited', cwd: directory, output: 'terminal-ok' })
    )
  })

  it('rejects a cwd outside the workspace', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-terminal-'))
    service = new TerminalService()

    await expect(
      service.start({
        sessionId: 'session-1',
        workspacePath: directory,
        cwd: '..',
        command: 'pwd'
      })
    ).rejects.toThrow('inside the workspace')
  })

  it('stops only the requested running process', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-terminal-'))
    service = new TerminalService()
    const run = await service.start({
      sessionId: 'session-1',
      workspacePath: directory,
      command: 'sleep 10'
    })

    await expect(service.stop(run.id)).resolves.toBe(true)
    expect((await waitForExit(run.id))?.status).toBe('stopped')
  })
})

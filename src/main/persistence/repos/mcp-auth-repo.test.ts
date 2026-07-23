import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { McpAuthRepository } from './mcp-auth-repo'

describe('McpAuthRepository', () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map((tempPath) => rm(tempPath, { recursive: true, force: true }))
    )
  })

  it('keeps OAuth state in a separate owner-only file and prunes deleted servers', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-mcp-auth-test-'))
    tempPaths.push(tempDir)
    const authPath = path.join(tempDir, '.tia-studio', 'mcp-auth.json')
    const repository = new McpAuthRepository(authPath)

    await repository.updateState('linear', () => ({
      tokens: { access_token: 'test-access-token', token_type: 'Bearer' },
      codeVerifier: 'temporary-verifier',
      state: 'temporary-state',
      redirectUrl: 'http://127.0.0.1:4567/oauth/callback'
    }))

    expect(await repository.getStatus('linear')).toBe('signed-in')
    expect(await repository.getState('linear')).toMatchObject({
      tokens: { access_token: 'test-access-token' },
      codeVerifier: 'temporary-verifier'
    })
    expect(JSON.parse(await readFile(authPath, 'utf-8'))).toMatchObject({
      version: 1,
      servers: { linear: { tokens: { access_token: 'test-access-token' } } }
    })

    if (process.platform !== 'win32') {
      expect((await stat(path.dirname(authPath))).mode & 0o777).toBe(0o700)
      expect((await stat(authPath)).mode & 0o777).toBe(0o600)
    }

    await repository.retain([])
    expect(await repository.getState('linear')).toBeUndefined()
  })
})

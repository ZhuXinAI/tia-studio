import { describe, expect, it } from 'vitest'
import { getCodexCliStatus } from './codex-cli'

describe('getCodexCliStatus', () => {
  it('returns available status when codex responds with a version', async () => {
    const status = await getCodexCliStatus(async () => ({
      stdout: 'codex 0.105.0\n',
      stderr: ''
    }))

    expect(status).toEqual({
      available: true,
      version: 'codex 0.105.0',
      errorMessage: null
    })
  })

  it('returns unavailable when codex is missing', async () => {
    const missingBinaryError = new Error('spawn codex ENOENT') as NodeJS.ErrnoException
    missingBinaryError.code = 'ENOENT'

    const status = await getCodexCliStatus(async () => {
      throw missingBinaryError
    })

    expect(status).toEqual({
      available: false,
      version: null,
      errorMessage: 'Codex CLI is not installed or not available on PATH.'
    })
  })

  it('returns the execution error when codex cannot be probed', async () => {
    const status = await getCodexCliStatus(async () => {
      throw new Error('Permission denied')
    })

    expect(status).toEqual({
      available: false,
      version: null,
      errorMessage: 'Permission denied'
    })
  })
})

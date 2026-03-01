import { describe, expect, it } from 'vitest'
import { resolveServerConfig } from './server-config'

describe('resolveServerConfig', () => {
  it('forces localhost and generates token when missing', () => {
    const config = resolveServerConfig({})

    expect(config.host).toBe('127.0.0.1')
    expect(config.token.length).toBeGreaterThan(20)
  })
})

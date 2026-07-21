import { describe, expect, it } from 'vitest'
import { McpServerHealthRegistry } from './mcp-server-health'

describe('McpServerHealthRegistry', () => {
  it('tracks connection health without retaining removed server entries', () => {
    const health = new McpServerHealthRegistry()
    health.connected('weather', 2)
    health.failed('broken')
    health.unsupported('remote')

    expect(health.list()).toMatchObject({
      weather: { state: 'connected', toolCount: 2 },
      broken: { state: 'error' },
      remote: { state: 'unsupported' }
    })

    health.retain(['weather'])
    expect(health.list()).toMatchObject({ weather: { state: 'connected', toolCount: 2 } })
    expect(health.list()).not.toHaveProperty('broken')
    expect(health.list()).not.toHaveProperty('remote')
  })
})

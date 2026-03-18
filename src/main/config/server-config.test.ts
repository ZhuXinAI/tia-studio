import { createServer, type Server } from 'node:net'
import { describe, expect, it } from 'vitest'
import { resolveAvailableServerPort, resolveServerConfig } from './server-config'

async function listen(host: string, port: number): Promise<Server> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen({ host, port }, () => {
      resolve(server)
    })
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function getUnusedTcpPort(host: string): Promise<number> {
  const server = await listen(host, 0)
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('Expected a TCP address while reserving a test port')
  }

  await closeServer(server)
  return address.port
}

describe('resolveServerConfig', () => {
  it('forces localhost and generates token when missing', () => {
    const config = resolveServerConfig({})

    expect(config.host).toBe('127.0.0.1')
    expect(config.token.length).toBeGreaterThan(20)
  })
  it('keeps the preferred port when it is available', async () => {
    const preferredPort = await getUnusedTcpPort('127.0.0.1')

    await expect(
      resolveAvailableServerPort({
        host: '127.0.0.1',
        preferredPort
      })
    ).resolves.toBe(preferredPort)
  })

  it('falls back to another localhost port when the preferred port is already in use', async () => {
    const blockingServer = await listen('127.0.0.1', 0)

    try {
      const address = blockingServer.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP address for the blocking server')
      }

      const resolvedPort = await resolveAvailableServerPort({
        host: '127.0.0.1',
        preferredPort: address.port
      })

      expect(resolvedPort).not.toBe(address.port)

      const verificationServer = await listen('127.0.0.1', resolvedPort)
      await closeServer(verificationServer)
    } finally {
      await closeServer(blockingServer)
    }
  })
})

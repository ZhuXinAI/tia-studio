import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

type ServerConfigInput = {
  port?: number
  token?: string
}

export type ServerConfig = {
  host: '127.0.0.1'
  port: number
  token: string
}

export function resolveServerConfig(input: ServerConfigInput): ServerConfig {
  return {
    host: '127.0.0.1',
    port: input.port ?? 4769,
    token: input.token ?? `tia_${randomUUID().replaceAll('-', '')}`
  }
}

function reserveServerPort(host: ServerConfig['host'], port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(
      {
        host,
        port,
        exclusive: true
      },
      () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close(() => {
            reject(new Error('Server port reservation did not return a TCP address'))
          })
          return
        }

        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve(address.port)
        })
      }
    )
  })
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
}

export async function resolveAvailableServerPort(input: {
  host: ServerConfig['host']
  preferredPort: number
}): Promise<number> {
  try {
    return await reserveServerPort(input.host, input.preferredPort)
  } catch (error) {
    if (!isErrorWithCode(error, 'EADDRINUSE')) {
      throw error
    }

    return reserveServerPort(input.host, 0)
  }
}

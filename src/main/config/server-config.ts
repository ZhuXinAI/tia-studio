import { randomUUID } from 'node:crypto'

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

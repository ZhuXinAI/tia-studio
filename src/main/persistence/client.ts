import { createClient, type Client } from '@libsql/client'

export type AppDatabase = Client

export function resolveDatabaseUrl(pathOrUrl: string): string {
  if (
    pathOrUrl.startsWith('file:') ||
    pathOrUrl.startsWith('libsql:') ||
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://')
  ) {
    return pathOrUrl
  }

  if (pathOrUrl === ':memory:') {
    return 'file::memory:'
  }

  return `file:${pathOrUrl}`
}

export function createAppDatabase(pathOrUrl: string): AppDatabase {
  return createClient({
    url: resolveDatabaseUrl(pathOrUrl)
  })
}

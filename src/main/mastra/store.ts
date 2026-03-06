import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { createClient } from '@libsql/client'
import { resolveDatabaseUrl } from '../persistence/client'

export async function createMastraInstance(pathOrUrl: string): Promise<Mastra> {
  // Create a client with foreign keys enabled
  const client = createClient({
    url: resolveDatabaseUrl(pathOrUrl)
  })

  // Enable foreign key constraints before using the client
  await client.execute('PRAGMA foreign_keys = ON')

  const storage = new LibSQLStore({
    id: 'tia-studio-storage',
    client
  })

  return new Mastra({
    storage,
    agents: {}
  })
}

import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { createClient } from '@libsql/client'
import { resolveDatabaseUrl } from '../persistence/client'

export function createMastraInstance(pathOrUrl: string): Mastra {
  // Create a client with foreign keys enabled
  const client = createClient({
    url: resolveDatabaseUrl(pathOrUrl)
  })

  // Enable foreign key constraints
  // Note: This is fire-and-forget, but LibSQLStore will handle initialization
  void client.execute('PRAGMA foreign_keys = ON')

  const storage = new LibSQLStore({
    id: 'tia-studio-storage',
    client
  })

  return new Mastra({
    storage,
    agents: {}
  })
}

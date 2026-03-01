import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { resolveDatabaseUrl } from '../persistence/client'

export function createMastraInstance(pathOrUrl: string): Mastra {
  const storage = new LibSQLStore({
    id: 'tia-studio-storage',
    url: resolveDatabaseUrl(pathOrUrl)
  })

  return new Mastra({
    storage,
    agents: {}
  })
}

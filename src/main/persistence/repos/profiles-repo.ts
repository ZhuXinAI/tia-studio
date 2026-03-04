import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppProfile = {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function parseProfileRow(row: Record<string, unknown>): AppProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class ProfilesRepository {
  constructor(private readonly db: AppDatabase) {}

  async getActiveProfile(): Promise<AppProfile | null> {
    const result = await this.db.execute(
      'SELECT id, name, is_active, created_at, updated_at FROM app_profiles WHERE is_active = 1 LIMIT 1'
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseProfileRow(row as Record<string, unknown>)
  }

  async ensureDefaultProfile(name = 'Default Profile'): Promise<AppProfile> {
    const activeProfile = await this.getActiveProfile()

    if (activeProfile) {
      return activeProfile
    }

    const id = randomUUID()
    await this.db.execute('INSERT INTO app_profiles (id, name, is_active) VALUES (?, ?, 1)', [
      id,
      name
    ])

    const createdProfile = await this.getActiveProfile()
    if (!createdProfile) {
      throw new Error('Failed to create default profile')
    }

    return createdProfile
  }
}

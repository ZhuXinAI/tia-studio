import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { SecuritySettingsRepository } from './security-settings-repo'

describe('SecuritySettingsRepository', () => {
  let db: AppDatabase
  let repo: SecuritySettingsRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new SecuritySettingsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns disabled defaults when preferences are missing', async () => {
    await expect(repo.getSettings()).resolves.toEqual({
      promptInjectionEnabled: false,
      piiDetectionEnabled: false,
      guardrailProviderId: null
    })
  })

  it('persists explicit guardrail settings', async () => {
    await expect(
      repo.saveSettings({
        promptInjectionEnabled: true,
        piiDetectionEnabled: true,
        guardrailProviderId: 'provider-1'
      })
    ).resolves.toEqual({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: 'provider-1'
    })

    await expect(repo.getSettings()).resolves.toEqual({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: 'provider-1'
    })
  })
})

import type { AppDatabase } from '../client'

export type SecuritySettings = {
  promptInjectionEnabled: boolean
  piiDetectionEnabled: boolean
  guardrailProviderId: string | null
}

const promptInjectionEnabledKey = 'security.prompt_injection_enabled'
const piiDetectionEnabledKey = 'security.pii_detection_enabled'
const guardrailProviderIdKey = 'security.guardrail_provider_id'

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true') {
      return true
    }

    if (normalized === '0' || normalized === 'false') {
      return false
    }
  }

  return fallback
}

function normalizeStringPreference(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export class SecuritySettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async getSettings(): Promise<SecuritySettings> {
    const result = await this.db.execute(
      'SELECT key, value FROM app_preferences WHERE key IN (?, ?, ?)',
      [promptInjectionEnabledKey, piiDetectionEnabledKey, guardrailProviderIdKey]
    )

    const preferences = new Map<string, unknown>()
    for (const row of result.rows) {
      const record = row as Record<string, unknown>
      preferences.set(String(record.key), record.value)
    }

    return {
      promptInjectionEnabled: normalizeBooleanPreference(
        preferences.get(promptInjectionEnabledKey),
        true
      ),
      piiDetectionEnabled: normalizeBooleanPreference(
        preferences.get(piiDetectionEnabledKey),
        true
      ),
      guardrailProviderId: normalizeStringPreference(preferences.get(guardrailProviderIdKey))
    }
  }

  async saveSettings(input: Partial<SecuritySettings>): Promise<SecuritySettings> {
    if (input.promptInjectionEnabled !== undefined) {
      await this.setPreference(
        promptInjectionEnabledKey,
        input.promptInjectionEnabled ? 'true' : 'false'
      )
    }

    if (input.piiDetectionEnabled !== undefined) {
      await this.setPreference(piiDetectionEnabledKey, input.piiDetectionEnabled ? 'true' : 'false')
    }

    if (input.guardrailProviderId !== undefined) {
      if (input.guardrailProviderId) {
        await this.setPreference(guardrailProviderIdKey, input.guardrailProviderId)
      } else {
        await this.deletePreference(guardrailProviderIdKey)
      }
    }

    return this.getSettings()
  }

  private async setPreference(key: string, value: string): Promise<void> {
    await this.db.execute(
      `
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [key, value]
    )
  }

  private async deletePreference(key: string): Promise<void> {
    await this.db.execute('DELETE FROM app_preferences WHERE key = ?', [key])
  }
}

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { FieldLabel } from '../../../components/ui/field'
import { Switch } from '../../../components/ui/switch'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  getSecuritySettings,
  updateSecuritySettings,
  type SecuritySettings
} from '../security/security-settings-query'

type SavingField = 'promptInjection' | 'pii' | 'provider' | null
const securitySelectClassName =
  'flex h-11 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-2 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]'

export function SecuritySettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<SecuritySettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savingField, setSavingField] = useState<SavingField>(null)

  const toErrorMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof Error) {
        const message = error.message.trim()
        if (message.length > 0) {
          return message
        }
      }

      return t('settings.security.toasts.unexpectedError')
    },
    [t]
  )

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextSettings = await getSecuritySettings()
      setSettings(nextSettings)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [toErrorMessage])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const saveSettings = async (
    field: Exclude<SavingField, null>,
    input: {
      promptInjectionEnabled?: boolean
      piiDetectionEnabled?: boolean
      guardrailProviderId?: string | null
    },
    successMessage: string
  ): Promise<void> => {
    setSavingField(field)

    try {
      const nextSettings = await updateSecuritySettings(input)
      setSettings(nextSettings)
      toast.success(successMessage)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setSavingField(null)
    }
  }

  const togglePromptInjection = async (checked: boolean): Promise<void> => {
    if (!settings || settings.promptInjectionEnabled === checked) {
      return
    }

    await saveSettings(
      'promptInjection',
      { promptInjectionEnabled: checked },
      checked
        ? t('settings.security.toasts.promptInjectionEnabled')
        : t('settings.security.toasts.promptInjectionDisabled')
    )
  }

  const togglePiiDetection = async (checked: boolean): Promise<void> => {
    if (!settings || settings.piiDetectionEnabled === checked) {
      return
    }

    await saveSettings(
      'pii',
      { piiDetectionEnabled: checked },
      checked ? t('settings.security.toasts.piiEnabled') : t('settings.security.toasts.piiDisabled')
    )
  }

  const updateGuardrailProvider = async (providerId: string): Promise<void> => {
    const nextProviderId = providerId.trim().length > 0 ? providerId : null
    if (!settings || settings.guardrailProviderId === nextProviderId) {
      return
    }

    await saveSettings(
      'provider',
      { guardrailProviderId: nextProviderId },
      t('settings.security.toasts.providerUpdated')
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">Guardrails and policy</p>
        <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">
          {t('settings.security.title')}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('settings.security.description')}</p>
      </header>

      <Card className="border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_78%,transparent))]">
        <CardHeader>
          <p className="section-kicker">Guardrail switches</p>
          <CardTitle className="font-editorial text-[1.9rem] leading-none tracking-[-0.03em]">
            {t('settings.security.guardrails.title')}
          </CardTitle>
          <CardDescription>{t('settings.security.guardrails.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {isLoading || !settings ? (
              <p className="text-sm text-muted-foreground">{t('settings.security.loading')}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {t('settings.security.promptInjection.title')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.security.promptInjection.description')}
                    </p>
                  </div>
                  <Switch
                    checked={settings.promptInjectionEnabled}
                    disabled={savingField !== null}
                    onCheckedChange={(checked) => {
                      void togglePromptInjection(checked)
                    }}
                    aria-label={t('settings.security.promptInjection.title')}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('settings.security.pii.title')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.security.pii.description')}
                    </p>
                  </div>
                  <Switch
                    checked={settings.piiDetectionEnabled}
                    disabled={savingField !== null}
                    onCheckedChange={(checked) => {
                      void togglePiiDetection(checked)
                    }}
                    aria-label={t('settings.security.pii.title')}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
        <CardHeader>
          <p className="section-kicker">Provider choice</p>
          <CardTitle className="font-editorial text-[1.7rem] leading-none tracking-[-0.03em]">
            {t('settings.security.provider.title')}
          </CardTitle>
          <CardDescription>{t('settings.security.provider.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading || !settings ? (
            <p className="text-sm text-muted-foreground">{t('settings.security.loading')}</p>
          ) : (
            <>
              <div className="space-y-2">
                <FieldLabel htmlFor="security-guardrail-provider">
                  {t('settings.security.provider.label')}
                </FieldLabel>
                <select
                  id="security-guardrail-provider"
                  className={securitySelectClassName}
                  disabled={savingField !== null}
                  value={settings.guardrailProviderId ?? ''}
                  onChange={(event) => {
                    void updateGuardrailProvider(event.target.value)
                  }}
                >
                  <option value="">{t('settings.security.provider.defaultOption')}</option>
                  {settings.availableProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {`${provider.name} · ${provider.selectedModel}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('settings.security.provider.hint')}
              </p>
              {settings.availableProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('settings.security.provider.empty')}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

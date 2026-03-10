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
    <div className="py-4 flex flex-col gap-4 space-y-6">
      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>{t('settings.security.title')}</CardTitle>
          <CardDescription>{t('settings.security.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">{t('settings.security.guardrails.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.security.guardrails.description')}
              </p>
            </div>

            {isLoading || !settings ? (
              <p className="text-sm text-muted-foreground">{t('settings.security.loading')}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
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

                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
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

      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>{t('settings.security.provider.title')}</CardTitle>
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

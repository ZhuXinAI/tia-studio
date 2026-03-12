import { Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Switch } from '../../../components/ui/switch'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  createDefaultManagedRuntimesState,
  getManagedRuntimeStatus,
  getRuntimeOnboardingSkillsStatus,
  installRuntimeOnboardingSkills,
  installManagedRuntime,
  isManagedRuntimeReady,
  pickCustomRuntime,
  type ManagedRuntimesState,
  type RuntimeOnboardingSkillId
} from './managed-runtimes-query'

const recommendedSkillOptions: Array<{
  id: RuntimeOnboardingSkillId
  titleKey: string
  descriptionKey: string
  command: string
}> = [
  {
    id: 'agent-browser',
    titleKey: 'settings.runtime.onboarding.skills.agentBrowser.title',
    descriptionKey: 'settings.runtime.onboarding.skills.agentBrowser.description',
    command: 'bunx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser'
  },
  {
    id: 'find-skills',
    titleKey: 'settings.runtime.onboarding.skills.findSkills.title',
    descriptionKey: 'settings.runtime.onboarding.skills.findSkills.description',
    command: 'bunx skills add https://github.com/vercel-labs/skills --skill find-skills'
  }
]

type RuntimeOnboardingPanelProps = {
  showHeader?: boolean
}

export function RuntimeOnboardingPanel({
  showHeader = true
}: RuntimeOnboardingPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<ManagedRuntimesState>(createDefaultManagedRuntimesState())
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [selectedSkillIds, setSelectedSkillIds] = useState<RuntimeOnboardingSkillId[]>([
    'agent-browser',
    'find-skills'
  ])
  const [installedSkillIds, setInstalledSkillIds] = useState<RuntimeOnboardingSkillId[]>([])
  const [isSkillsLoading, setIsSkillsLoading] = useState(true)

  const toErrorMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof Error) {
        const message = error.message.trim()
        if (message.length > 0) {
          return message
        }
      }

      return t('settings.runtime.toasts.unexpectedError')
    },
    [t]
  )

  useEffect(() => {
    let isMounted = true

    void getManagedRuntimeStatus()
      .then((nextState) => {
        if (isMounted) {
          setState(nextState)
        }
      })
      .catch((error) => {
        if (isMounted) {
          toast.error(toErrorMessage(error))
        }
      })

    void getRuntimeOnboardingSkillsStatus()
      .then((nextInstalledSkillIds) => {
        if (isMounted) {
          setInstalledSkillIds(nextInstalledSkillIds)
        }
      })
      .catch((error) => {
        if (isMounted) {
          toast.error(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSkillsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [toErrorMessage])

  const bunReady = isManagedRuntimeReady(state.bun)

  const toggleSkillSelection = (skillId: RuntimeOnboardingSkillId, enabled: boolean): void => {
    setSelectedSkillIds((current) => {
      if (enabled) {
        return current.includes(skillId) ? current : [...current, skillId]
      }

      return current.filter((candidate) => candidate !== skillId)
    })
  }

  const handleBunAction = async (action: 'install' | 'pick'): Promise<void> => {
    const busyKey = `bun:${action}`
    setBusyAction(busyKey)

    try {
      if (action === 'install') {
        setState(await installManagedRuntime('bun'))
        toast.success(t('settings.runtime.toasts.installSuccess', { kind: 'bun' }))
        return
      }

      const nextState = await pickCustomRuntime('bun')
      if (nextState) {
        setState(nextState)
        toast.success(t('settings.runtime.toasts.pickSuccess', { kind: 'bun' }))
      }
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const handleInstallSelectedSkills = async (): Promise<void> => {
    const skillsToInstall = selectedSkillIds.filter(
      (skillId) => !installedSkillIds.includes(skillId)
    )

    if (skillsToInstall.length === 0) {
      toast.success(t('settings.runtime.toasts.skillsAlreadyInstalled'))
      return
    }

    setBusyAction('onboarding:skills')
    try {
      await installRuntimeOnboardingSkills(skillsToInstall)
      setInstalledSkillIds((current) => {
        const next = new Set(current)
        for (const skillId of skillsToInstall) {
          next.add(skillId)
        }
        return Array.from(next)
      })
      toast.success(t('settings.runtime.toasts.skillsInstallSuccess'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="space-y-4">
      {showHeader ? (
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t('settings.runtime.onboarding.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('settings.runtime.onboarding.description')}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('settings.runtime.onboarding.steps.bun.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('settings.runtime.onboarding.steps.bun.description')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('settings.runtime.onboarding.steps.bun.status', {
              status: state.bun.status
            })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-4">
          <Button
            type="button"
            onClick={() => void handleBunAction('install')}
            disabled={busyAction !== null}
          >
            <Download className="size-4" />
            {busyAction === 'bun:install'
              ? t('settings.runtime.buttons.installing')
              : t('settings.runtime.onboarding.steps.bun.installAction')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleBunAction('pick')}
            disabled={busyAction !== null}
          >
            {t('settings.runtime.onboarding.steps.bun.pickAction')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t('settings.runtime.onboarding.steps.skills.title')}
          </p>
          <p className="text-sm text-muted-foreground">
            {bunReady
              ? t('settings.runtime.onboarding.steps.skills.description')
              : t('settings.runtime.onboarding.steps.skills.lockedDescription')}
          </p>
        </div>

        {bunReady ? (
          <div className="space-y-3 pt-4">
            {recommendedSkillOptions.map((skill) => {
              const checked = selectedSkillIds.includes(skill.id)
              const isInstalled = installedSkillIds.includes(skill.id)

              return (
                <div
                  key={skill.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t(skill.titleKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(skill.descriptionKey)}</p>
                    <p className="text-xs text-muted-foreground">
                      {isSkillsLoading
                        ? t('settings.runtime.onboarding.skills.status.loading')
                        : isInstalled
                          ? t('settings.runtime.onboarding.skills.status.installed')
                          : t('settings.runtime.onboarding.skills.status.notInstalled')}
                    </p>
                    <code className="block rounded-md bg-muted px-2 py-1 text-[11px] leading-relaxed">
                      {skill.command}
                    </code>
                  </div>
                  <Switch
                    aria-label={t(skill.titleKey)}
                    checked={checked}
                    disabled={busyAction !== null}
                    onCheckedChange={(enabled) => {
                      toggleSkillSelection(skill.id, enabled)
                    }}
                  />
                </div>
              )
            })}

            <Button
              type="button"
              onClick={() => void handleInstallSelectedSkills()}
              disabled={busyAction !== null || selectedSkillIds.length === 0}
            >
              {busyAction === 'onboarding:skills'
                ? t('settings.runtime.onboarding.steps.skills.installingAction')
                : t('settings.runtime.onboarding.steps.skills.installAction')}
            </Button>
          </div>
        ) : (
          <p className="pt-4 text-xs text-muted-foreground">
            {t('settings.runtime.onboarding.steps.skills.bunRequired')}
          </p>
        )}
      </div>
    </div>
  )
}

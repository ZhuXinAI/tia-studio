import { BookOpen, Download, ExternalLink, Github, Globe, MessageSquare } from 'lucide-react'
import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'
import { getDesktopAppInfo, type DesktopAppInfo } from '../../../lib/desktop-app-info'

type AboutLinkItem = {
  title: string
  description: string
  actionLabel: string
  href: string
  icon: ComponentType<{ className?: string }>
}

type AutoUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'unsupported'
  | 'error'

type AutoUpdateState = {
  enabled: boolean
  status: AutoUpdateStatus
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}

const fallbackAppInfo: DesktopAppInfo = {
  name: 'TIA Studio',
  version: '0.0.0'
}

const fallbackAutoUpdateState: AutoUpdateState = {
  enabled: true,
  status: 'idle',
  availableVersion: null,
  lastCheckedAt: null,
  message: null
}

function AboutToggleRow({
  label,
  description,
  checked,
  onToggle,
  showBorder,
  disabled
}: {
  label: string
  description: string
  checked: boolean
  onToggle: () => void
  showBorder?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-6 py-4',
        showBorder ? 'border-border/60 border-b' : undefined
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label}`}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          'relative h-6 w-11 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'border-emerald-400/60 bg-emerald-500' : 'border-border/80 bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 block size-5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  )
}

function AboutLinkRow({
  title,
  description,
  href,
  actionLabel,
  icon: Icon,
  showBorder
}: AboutLinkItem & { showBorder?: boolean }): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-6 py-4',
        showBorder ? 'border-border/60 border-b' : undefined
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="text-muted-foreground size-4" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-muted-foreground truncate text-xs">{description}</p>
        </div>
      </div>

      <Button asChild variant="outline" size="sm" className="shrink-0">
        <a href={href} target="_blank" rel="noreferrer">
          {actionLabel}
        </a>
      </Button>
    </div>
  )
}

export function AboutSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [appInfo, setAppInfo] = useState<DesktopAppInfo>(fallbackAppInfo)
  const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateState>(fallbackAutoUpdateState)
  const [isSavingAutoUpdate, setIsSavingAutoUpdate] = useState(false)
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false)
  const aboutLinks: AboutLinkItem[] = [
    {
      title: t('settings.about.links.docs.title'),
      description: t('settings.about.links.docs.description'),
      actionLabel: t('settings.about.links.docs.action'),
      href: 'https://github.com/ZhuXinAI/tia-studio',
      icon: BookOpen
    },
    {
      title: t('settings.about.links.releaseNotes.title'),
      description: t('settings.about.links.releaseNotes.description'),
      actionLabel: t('settings.about.links.releaseNotes.action'),
      href: 'https://github.com/ZhuXinAI/tia-studio/releases',
      icon: Download
    },
    {
      title: t('settings.about.links.officialWebsite.title'),
      description: t('settings.about.links.officialWebsite.description'),
      actionLabel: t('settings.about.links.officialWebsite.action'),
      href: 'https://buildmind.ai',
      icon: Globe
    },
    {
      title: t('settings.about.links.feedback.title'),
      description: t('settings.about.links.feedback.description'),
      actionLabel: t('settings.about.links.feedback.action'),
      href: 'https://github.com/ZhuXinAI/tia-studio/issues',
      icon: MessageSquare
    }
  ]

  useEffect(() => {
    let cancelled = false

    void getDesktopAppInfo().then((nextAppInfo) => {
      if (!cancelled) {
        setAppInfo(nextAppInfo)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const getAutoUpdateState = window.tiaDesktop?.getAutoUpdateState

    if (!getAutoUpdateState) {
      return
    }

    void getAutoUpdateState()
      .then((nextState) => {
        if (!cancelled) {
          setAutoUpdateState(nextState)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAutoUpdateState((current) => ({
            ...current,
            status: 'error',
            message: t('settings.about.autoUpdate.loadError')
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const versionLabel = useMemo(() => {
    return appInfo.version.startsWith('v') ? appInfo.version : `v${appInfo.version}`
  }, [appInfo.version])

  const statusRole = autoUpdateState.status === 'error' ? 'alert' : 'status'

  const toggleAutoUpdate = async (): Promise<void> => {
    const setAutoUpdateEnabled = window.tiaDesktop?.setAutoUpdateEnabled
    if (!setAutoUpdateEnabled || isSavingAutoUpdate || isCheckingForUpdates) {
      return
    }

    setIsSavingAutoUpdate(true)
    try {
      const nextState = await setAutoUpdateEnabled(!autoUpdateState.enabled)
      setAutoUpdateState(nextState)
    } catch {
      setAutoUpdateState((current) => ({
        ...current,
        status: 'error',
        message: t('settings.about.autoUpdate.saveError')
      }))
    } finally {
      setIsSavingAutoUpdate(false)
    }
  }

  const checkForUpdates = async (): Promise<void> => {
    const checkForUpdatesInDesktop = window.tiaDesktop?.checkForUpdates
    if (!checkForUpdatesInDesktop || isSavingAutoUpdate || isCheckingForUpdates) {
      return
    }

    setIsCheckingForUpdates(true)
    try {
      const nextState = await checkForUpdatesInDesktop()
      setAutoUpdateState(nextState)
    } catch {
      setAutoUpdateState((current) => ({
        ...current,
        status: 'error',
        message: t('settings.about.autoUpdate.checkError')
      }))
    } finally {
      setIsCheckingForUpdates(false)
    }
  }

  return (
    <div className="py-4 flex flex-col gap-4">
      <header className="py-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.about.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('settings.about.description')}
        </p>
      </header>

      {autoUpdateState.message ? (
        <p
          role={statusRole}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            autoUpdateState.status === 'error'
              ? 'border-destructive/70 text-destructive'
              : 'border-emerald-400/70 text-emerald-300'
          )}
        >
          {autoUpdateState.message}
        </p>
      ) : null}

      <Card className="border-border/70 bg-card/80 gap-0 overflow-hidden py-0">
        <CardHeader className="border-border/60 border-b py-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t('settings.about.cardTitle')}</CardTitle>
            <Button asChild variant="ghost" size="icon">
              <a
                href="https://github.com/ZhuXinAI/tia-studio"
                target="_blank"
                rel="noreferrer"
                aria-label={t('settings.about.repositoryAriaLabel')}
              >
                <Github className="size-4" />
              </a>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-0 py-0">
          <div className="border-border/60 flex items-center justify-between gap-4 border-b px-6 py-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="from-primary to-primary/70 grid size-20 shrink-0 place-items-center rounded-full bg-gradient-to-br text-2xl font-semibold text-primary-foreground shadow-lg">
                TS
              </div>
              <div className="min-w-0 my-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="truncate text-3xl font-semibold leading-tight">{appInfo.name}</p>
                  <span className="border-primary/40 bg-primary/10 text-primary inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                    {versionLabel}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t('settings.about.appDescription')}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={isSavingAutoUpdate || isCheckingForUpdates}
              onClick={() => {
                void checkForUpdates()
              }}
            >
              {isCheckingForUpdates
                ? t('settings.about.buttons.checking')
                : t('settings.about.buttons.checkUpdate')}
              <ExternalLink className="size-3.5" />
            </Button>
          </div>

          <AboutToggleRow
            label={t('settings.about.autoUpdate.label')}
            description={
              autoUpdateState.enabled
                ? t('settings.about.autoUpdate.enabledDescription')
                : t('settings.about.autoUpdate.disabledDescription')
            }
            checked={autoUpdateState.enabled}
            onToggle={() => {
              void toggleAutoUpdate()
            }}
            disabled={isSavingAutoUpdate || isCheckingForUpdates}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 gap-0 overflow-hidden py-0">
        <CardContent className="px-0 py-0">
          {aboutLinks.map((link, index) => (
            <AboutLinkRow key={link.title} {...link} showBorder={index < aboutLinks.length - 1} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

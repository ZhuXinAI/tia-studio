import { useEffect, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'

export type AutoUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'update-downloaded'
  | 'up-to-date'
  | 'unsupported'
  | 'error'

export type AutoUpdateState = {
  enabled: boolean
  status: AutoUpdateStatus
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}

const fallbackAutoUpdateState: AutoUpdateState = {
  enabled: true,
  status: 'idle',
  availableVersion: null,
  lastCheckedAt: null,
  message: null
}

export function useAutoUpdate(): {
  autoUpdateState: AutoUpdateState
  hasDownloadedUpdate: boolean
  isSavingAutoUpdate: boolean
  isCheckingForUpdates: boolean
  isRestartingToUpdate: boolean
  toggleAutoUpdate: () => Promise<void>
  checkForUpdates: () => Promise<void>
  restartToUpdate: () => Promise<void>
} {
  const { t } = useTranslation()
  const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateState>(fallbackAutoUpdateState)
  const [isSavingAutoUpdate, setIsSavingAutoUpdate] = useState(false)
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false)
  const [isRestartingToUpdate, setIsRestartingToUpdate] = useState(false)

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
  }, [t])

  useEffect(() => {
    const unsubscribe = window.tiaDesktop?.onAutoUpdateStateChanged?.((nextState) => {
      setAutoUpdateState(nextState)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const hasDownloadedUpdate = autoUpdateState.status === 'update-downloaded'

  const toggleAutoUpdate = async (): Promise<void> => {
    const setAutoUpdateEnabled = window.tiaDesktop?.setAutoUpdateEnabled
    if (
      !setAutoUpdateEnabled ||
      isSavingAutoUpdate ||
      isCheckingForUpdates ||
      isRestartingToUpdate
    ) {
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
    if (
      !checkForUpdatesInDesktop ||
      isSavingAutoUpdate ||
      isCheckingForUpdates ||
      isRestartingToUpdate
    ) {
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

  const restartToUpdate = async (): Promise<void> => {
    const restartToUpdateInDesktop = window.tiaDesktop?.restartToUpdate
    if (
      !restartToUpdateInDesktop ||
      !hasDownloadedUpdate ||
      isSavingAutoUpdate ||
      isCheckingForUpdates ||
      isRestartingToUpdate
    ) {
      return
    }

    setIsRestartingToUpdate(true)
    try {
      await restartToUpdateInDesktop()
    } catch {
      setAutoUpdateState((current) => ({
        ...current,
        status: 'error',
        message: t('settings.about.autoUpdate.restartError')
      }))
      setIsRestartingToUpdate(false)
    }
  }

  return {
    autoUpdateState,
    hasDownloadedUpdate,
    isSavingAutoUpdate,
    isCheckingForUpdates,
    isRestartingToUpdate,
    toggleAutoUpdate,
    checkForUpdates,
    restartToUpdate
  }
}

import { useEffect, useEffectEvent, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  checkForUpdates as checkForDesktopUpdates,
  getAutoUpdateState as getDesktopAutoUpdateState,
  getDesktopCapabilities,
  restartToUpdate as restartDesktopToUpdate,
  setAutoUpdateEnabled as setDesktopAutoUpdateEnabled
} from '../../../lib/desktop-features'

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

export function useAutoUpdate(options?: { poll?: boolean }): {
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
  const autoUpdateSupported = getDesktopCapabilities().autoUpdate

  const loadAutoUpdateState = useEffectEvent(async (): Promise<void> => {
    if (!autoUpdateSupported) {
      return
    }

    try {
      const nextState = await getDesktopAutoUpdateState()
      setAutoUpdateState(nextState)
    } catch {
      setAutoUpdateState((current) => ({
        ...current,
        status: 'error',
        message: t('settings.about.autoUpdate.loadError')
      }))
    }
  })

  useEffect(() => {
    if (!autoUpdateSupported) {
      return
    }

    void loadAutoUpdateState()

    if (!options?.poll) {
      return
    }

    const interval = window.setInterval(() => {
      void loadAutoUpdateState()
    }, 15000)

    return () => {
      window.clearInterval(interval)
    }
  }, [autoUpdateSupported, options?.poll])

  const hasDownloadedUpdate = autoUpdateState.status === 'update-downloaded'

  const toggleAutoUpdate = async (): Promise<void> => {
    if (
      !autoUpdateSupported ||
      isSavingAutoUpdate ||
      isCheckingForUpdates ||
      isRestartingToUpdate
    ) {
      return
    }

    setIsSavingAutoUpdate(true)
    try {
      const nextState = await setDesktopAutoUpdateEnabled(!autoUpdateState.enabled)
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
    if (
      !autoUpdateSupported ||
      isSavingAutoUpdate ||
      isCheckingForUpdates ||
      isRestartingToUpdate
    ) {
      return
    }

    setIsCheckingForUpdates(true)
    try {
      const nextState = await checkForDesktopUpdates()
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
    if (
      !autoUpdateSupported ||
      !hasDownloadedUpdate ||
      isSavingAutoUpdate ||
      isCheckingForUpdates ||
      isRestartingToUpdate
    ) {
      return
    }

    setIsRestartingToUpdate(true)
    try {
      await restartDesktopToUpdate()
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

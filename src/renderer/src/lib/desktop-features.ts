import { createApiClient } from './api-client'
import { getDesktopBootstrap, getDesktopBootstrapSnapshot } from './desktop-bootstrap'

const apiClient = createApiClient()

export type DesktopAppInfo = {
  name: string
  version: string
}

export type DesktopAutoUpdateState = {
  enabled: boolean
  status:
    | 'idle'
    | 'checking'
    | 'update-available'
    | 'update-downloaded'
    | 'up-to-date'
    | 'unsupported'
    | 'error'
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}

const fallbackDesktopAppInfo: DesktopAppInfo = {
  name: 'TIA Studio',
  version: '0.0.0'
}

function toDisplayVersion(rawVersion: string): string {
  const normalized = rawVersion.trim()
  if (normalized.length === 0) {
    return fallbackDesktopAppInfo.version
  }

  return normalized
}

export async function getDesktopAppInfo(): Promise<DesktopAppInfo> {
  const bootstrap = await getDesktopBootstrap()
  return {
    name: bootstrap.app.name || fallbackDesktopAppInfo.name,
    version: toDisplayVersion(bootstrap.app.version)
  }
}

export function getDesktopCapabilities() {
  return getDesktopBootstrapSnapshot().capabilities
}

export async function getAutoUpdateState(): Promise<DesktopAutoUpdateState> {
  return apiClient.get<DesktopAutoUpdateState>('/v1/desktop/auto-update')
}

export async function setAutoUpdateEnabled(enabled: boolean): Promise<DesktopAutoUpdateState> {
  return apiClient.patch<DesktopAutoUpdateState>('/v1/desktop/auto-update', { enabled })
}

export async function checkForUpdates(): Promise<DesktopAutoUpdateState> {
  return apiClient.post<DesktopAutoUpdateState>('/v1/desktop/auto-update/check')
}

export async function restartToUpdate(): Promise<void> {
  await apiClient.post('/v1/desktop/auto-update/restart')
}

export async function pickDirectory(): Promise<string | null> {
  const response = await apiClient.post<{ path: string | null }>('/v1/desktop/dialogs/pick-directory')
  return response.path
}

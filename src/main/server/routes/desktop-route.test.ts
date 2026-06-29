import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopBootstrap } from '../../../shared/desktop-bootstrap'
import type {
  ManagedRuntimeKind,
  ManagedRuntimesState
} from '../../persistence/repos/managed-runtimes-repo'
import type { DesktopAutomationRecord, DesktopSkillRecord } from '../../../shared/desktop-discovery'
import { registerDesktopRoute } from './desktop-route'

function createManagedRuntimeState(): ManagedRuntimesState {
  const record = {
    source: 'none' as const,
    binaryPath: null,
    version: null,
    installedAt: null,
    lastCheckedAt: null,
    releaseUrl: null,
    checksum: null,
    status: 'missing' as const,
    errorMessage: null
  }

  return {
    bun: { ...record },
    uv: { ...record },
    'agent-browser': { ...record },
    'codex-acp': { ...record },
    'claude-agent-acp': { ...record }
  }
}

describe('desktop route', () => {
  const bootstrap: DesktopBootstrap = {
    apiBaseUrl: 'http://127.0.0.1:4769',
    authMode: 'bearer',
    authToken: 'desktop-token',
    app: {
      name: 'TIA Studio',
      version: '0.3.2',
      platform: 'darwin'
    },
    capabilities: {
      autoUpdate: true,
      managedRuntimes: true,
      nativeDirectoryPicker: true,
      runtimeOnboarding: true
    }
  }

  let app: Hono
  let managedRuntimeState: ManagedRuntimesState
  let setAutoUpdateEnabled: ReturnType<
    typeof vi.fn<
      (enabled: boolean) => Promise<{
        enabled: boolean
        status: 'idle'
        availableVersion: null
        lastCheckedAt: null
        message: null
      }>
    >
  >
  let checkManagedRuntimeLatest: ReturnType<
    typeof vi.fn<(kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>>
  >
  let installManagedRuntime: ReturnType<
    typeof vi.fn<(kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>>
  >
  let pickCustomRuntime: ReturnType<
    typeof vi.fn<(kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState | null>>
  >
  let clearManagedRuntime: ReturnType<
    typeof vi.fn<(kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>>
  >
  let installRuntimeOnboardingSkills: ReturnType<
    typeof vi.fn<
      (
        skillIds: Array<'agent-browser' | 'find-skills'>
      ) => Promise<Array<'agent-browser' | 'find-skills'>>
    >
  >
  let listSkills: ReturnType<typeof vi.fn<() => Promise<DesktopSkillRecord[]>>>
  let listAutomations: ReturnType<typeof vi.fn<() => Promise<DesktopAutomationRecord[]>>>
  let restartToUpdate: ReturnType<typeof vi.fn<() => void>>
  let pickDirectory: ReturnType<typeof vi.fn<() => Promise<string | null>>>

  beforeEach(() => {
    managedRuntimeState = createManagedRuntimeState()
    setAutoUpdateEnabled = vi.fn(async (enabled: boolean) => ({
      enabled,
      status: 'idle',
      availableVersion: null,
      lastCheckedAt: null,
      message: null
    }))
    checkManagedRuntimeLatest = vi.fn(async (_kind: ManagedRuntimeKind) => managedRuntimeState)
    installManagedRuntime = vi.fn(async (_kind: ManagedRuntimeKind) => managedRuntimeState)
    pickCustomRuntime = vi.fn(async (_kind: ManagedRuntimeKind) => managedRuntimeState)
    clearManagedRuntime = vi.fn(async (_kind: ManagedRuntimeKind) => managedRuntimeState)
    installRuntimeOnboardingSkills = vi.fn(
      async (skillIds: Array<'agent-browser' | 'find-skills'>) => skillIds
    )
    listSkills = vi.fn(async () => [
      {
        id: 'global-codex:agents-sdk',
        name: 'agents-sdk',
        description: 'Build AI agents.',
        source: 'global-codex',
        sourceRootPath: '/Users/demo/.codex/skills',
        directoryPath: '/Users/demo/.codex/skills/agents-sdk',
        relativePath: 'agents-sdk',
        skillFilePath: '/Users/demo/.codex/skills/agents-sdk/SKILL.md',
        canDelete: false
      }
    ])
    listAutomations = vi.fn(async () => [
      {
        id: 'daily-remote-job-scan',
        kind: 'cron',
        name: 'Daily remote job scan',
        prompt: 'Run the daily scan.',
        status: 'ACTIVE',
        rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=MO,WE,FR',
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        executionEnvironment: 'local',
        cwds: ['/Users/demo/project'],
        createdAt: '2026-06-27T00:00:00.000Z',
        updatedAt: '2026-06-29T00:00:00.000Z',
        directoryPath: '/Users/demo/.codex/automations/daily-remote-job-scan',
        filePath: '/Users/demo/.codex/automations/daily-remote-job-scan/automation.toml'
      }
    ])
    restartToUpdate = vi.fn(() => undefined)
    pickDirectory = vi.fn(async () => '/Users/demo/workspace')

    app = new Hono()
    registerDesktopRoute(app, {
      getDesktopBootstrap: () => bootstrap,
      getUiConfig: () => ({
        language: 'en-US',
        transparent: true
      }),
      setUiConfig: (config) => config,
      getSystemLocale: () => 'en-US',
      getAutoUpdateState: () => ({
        enabled: true,
        status: 'idle',
        availableVersion: null,
        lastCheckedAt: null,
        message: null
      }),
      setAutoUpdateEnabled,
      checkForUpdates: async () => ({
        enabled: true,
        status: 'up-to-date',
        availableVersion: null,
        lastCheckedAt: '2026-06-28T00:00:00.000Z',
        message: 'You are up to date.'
      }),
      restartToUpdate,
      getManagedRuntimeStatus: async () => managedRuntimeState,
      checkManagedRuntimeLatest,
      installManagedRuntime,
      pickCustomRuntime,
      clearManagedRuntime,
      getRuntimeOnboardingSkillsStatus: async () => ['agent-browser'],
      installRuntimeOnboardingSkills,
      listSkills,
      listAutomations,
      pickDirectory
    })
  })

  it('returns the desktop bootstrap payload', async () => {
    const response = await app.request('http://localhost/v1/desktop/bootstrap')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(bootstrap)
  })

  it('reads and updates ui config', async () => {
    const getResponse = await app.request('http://localhost/v1/desktop/ui-config')
    expect(getResponse.status).toBe(200)
    await expect(getResponse.json()).resolves.toEqual({
      language: 'en-US',
      transparent: true
    })

    const patchResponse = await app.request('http://localhost/v1/desktop/ui-config', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        language: 'zh-CN',
        transparent: false
      })
    })

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toEqual({
      language: 'zh-CN',
      transparent: false
    })
  })

  it('validates ui config payloads', async () => {
    const response = await app.request('http://localhost/v1/desktop/ui-config', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        language: 'not-a-locale'
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.any(String)
    })
  })

  it('reads system locale and auto update state', async () => {
    const localeResponse = await app.request('http://localhost/v1/desktop/system-locale')
    expect(localeResponse.status).toBe(200)
    await expect(localeResponse.json()).resolves.toEqual({ locale: 'en-US' })

    const autoUpdateResponse = await app.request('http://localhost/v1/desktop/auto-update')
    expect(autoUpdateResponse.status).toBe(200)
    await expect(autoUpdateResponse.json()).resolves.toEqual({
      enabled: true,
      status: 'idle',
      availableVersion: null,
      lastCheckedAt: null,
      message: null
    })
  })

  it('updates, checks, and safely restarts auto updates', async () => {
    const patchResponse = await app.request('http://localhost/v1/desktop/auto-update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        enabled: false
      })
    })

    expect(patchResponse.status).toBe(200)
    expect(setAutoUpdateEnabled).toHaveBeenCalledWith(false)

    const checkResponse = await app.request('http://localhost/v1/desktop/auto-update/check', {
      method: 'POST'
    })

    expect(checkResponse.status).toBe(200)
    await expect(checkResponse.json()).resolves.toEqual({
      enabled: true,
      status: 'up-to-date',
      availableVersion: null,
      lastCheckedAt: '2026-06-28T00:00:00.000Z',
      message: 'You are up to date.'
    })

    const restartResponse = await app.request('http://localhost/v1/desktop/auto-update/restart', {
      method: 'POST'
    })

    expect(restartResponse.status).toBe(204)
    expect(restartToUpdate).toHaveBeenCalledTimes(1)
  })

  it('returns a conflict when restart-to-update is unavailable', async () => {
    restartToUpdate.mockImplementation(() => {
      throw new Error('No downloaded update is ready to install.')
    })

    const response = await app.request('http://localhost/v1/desktop/auto-update/restart', {
      method: 'POST'
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'No downloaded update is ready to install.'
    })
  })

  it('supports managed runtime lifecycle routes and validation', async () => {
    const listResponse = await app.request('http://localhost/v1/desktop/managed-runtimes')
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual(managedRuntimeState)

    const checkLatestResponse = await app.request(
      'http://localhost/v1/desktop/managed-runtimes/bun/check-latest',
      {
        method: 'POST'
      }
    )
    expect(checkLatestResponse.status).toBe(200)
    expect(checkManagedRuntimeLatest).toHaveBeenCalledWith('bun')

    const installResponse = await app.request(
      'http://localhost/v1/desktop/managed-runtimes/uv/install',
      {
        method: 'POST'
      }
    )
    expect(installResponse.status).toBe(200)
    expect(installManagedRuntime).toHaveBeenCalledWith('uv')

    const pickCustomResponse = await app.request(
      'http://localhost/v1/desktop/managed-runtimes/agent-browser/pick-custom',
      {
        method: 'POST'
      }
    )
    expect(pickCustomResponse.status).toBe(200)
    expect(pickCustomRuntime).toHaveBeenCalledWith('agent-browser')

    const clearResponse = await app.request(
      'http://localhost/v1/desktop/managed-runtimes/codex-acp/custom',
      {
        method: 'DELETE'
      }
    )
    expect(clearResponse.status).toBe(200)
    expect(clearManagedRuntime).toHaveBeenCalledWith('codex-acp')

    const invalidKindResponse = await app.request(
      'http://localhost/v1/desktop/managed-runtimes/nope/install',
      {
        method: 'POST'
      }
    )
    expect(invalidKindResponse.status).toBe(400)
    await expect(invalidKindResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Managed runtime kind is invalid'
    })
  })

  it('reads and installs runtime onboarding skills', async () => {
    const listResponse = await app.request('http://localhost/v1/desktop/runtime-onboarding-skills')
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual({
      skillIds: ['agent-browser']
    })

    const installResponse = await app.request(
      'http://localhost/v1/desktop/runtime-onboarding-skills/install',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          skillIds: ['agent-browser', 'find-skills']
        })
      }
    )

    expect(installResponse.status).toBe(200)
    expect(installRuntimeOnboardingSkills).toHaveBeenCalledWith(['agent-browser', 'find-skills'])
    await expect(installResponse.json()).resolves.toEqual({
      skillIds: ['agent-browser', 'find-skills']
    })
  })

  it('returns discovered desktop skills', async () => {
    const response = await app.request('http://localhost/v1/desktop/skills')

    expect(response.status).toBe(200)
    expect(listSkills).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({
      skills: await listSkills()
    })
  })

  it('returns discovered desktop automations', async () => {
    const response = await app.request('http://localhost/v1/desktop/automations')

    expect(response.status).toBe(200)
    expect(listAutomations).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({
      automations: await listAutomations()
    })
  })

  it('returns the selected directory path through the dialog route', async () => {
    const response = await app.request('http://localhost/v1/desktop/dialogs/pick-directory', {
      method: 'POST'
    })

    expect(response.status).toBe(200)
    expect(pickDirectory).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({
      path: '/Users/demo/workspace'
    })
  })
})

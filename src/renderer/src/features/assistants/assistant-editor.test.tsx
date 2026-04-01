// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEditor } from './assistant-editor'
import { getAssistantHeartbeat } from './assistant-heartbeat-query'
import type { ConfiguredClawChannelRecord } from '../claws/claws-query'
import type { ProviderRecord } from '../settings/providers/providers-query'
import {
  createDefaultManagedRuntimesState,
  type ManagedRuntimesState
} from '../settings/runtimes/managed-runtimes-query'

vi.mock('./assistant-heartbeat-query', () => ({
  getAssistantHeartbeat: vi.fn(),
  updateAssistantHeartbeat: vi.fn(),
  DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES: 30,
  DEFAULT_ASSISTANT_HEARTBEAT_PROMPT:
    'Review recent work logs and recent conversations. Follow up only if needed.'
}))

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )

  if (!button) {
    throw new Error(`Could not find button with text: ${text}`)
  }

  return button
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(element: HTMLSelectElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('assistant editor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(getAssistantHeartbeat).mockResolvedValue(null)
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:3456',
        authToken: 'token'
      })),
      getManagedRuntimeStatus: vi.fn(async () => missingManagedRuntimes),
      pickDirectory: vi.fn(async () => null)
    }
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    if (container) {
      container.remove()
    }
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  const provider: ProviderRecord = {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'secret',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-5',
    providerModels: null,
    enabled: true,
    supportsVision: false,
    isBuiltIn: false,
    icon: null,
    officialSite: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z'
  }
  const codingProvider: ProviderRecord = {
    id: 'provider-coding',
    name: 'Codex ACP',
    type: 'codex-acp',
    apiKey: '',
    apiHost: null,
    selectedModel: 'default',
    providerModels: null,
    enabled: true,
    supportsVision: true,
    isBuiltIn: true,
    icon: null,
    officialSite: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z'
  }
  const claudeCodingProvider: ProviderRecord = {
    id: 'provider-claude-coding',
    name: 'Claude Agent ACP',
    type: 'claude-agent-acp',
    apiKey: '',
    apiHost: null,
    selectedModel: 'default',
    providerModels: null,
    enabled: true,
    supportsVision: true,
    isBuiltIn: true,
    icon: null,
    officialSite: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z'
  }
  const mcpServers = {
    docs: {
      isActive: true,
      name: 'Docs Server',
      type: 'stdio',
      command: 'npx',
      args: ['docs-server'],
      env: {},
      installSource: 'local'
    },
    github: {
      isActive: false,
      name: 'GitHub Server',
      type: 'stdio',
      command: 'npx',
      args: ['github-mcp'],
      env: {},
      installSource: 'local'
    }
  }
  const missingManagedRuntimes: ManagedRuntimesState = createDefaultManagedRuntimesState()
  const readyCodingManagedRuntimes: ManagedRuntimesState = {
    ...createDefaultManagedRuntimesState(),
    'codex-acp': {
      source: 'managed',
      binaryPath: '/managed/bin/codex-acp',
      version: 'codex-acp 0.10.0',
      installedAt: '2026-03-20T00:00:00.000Z',
      lastCheckedAt: '2026-03-20T00:00:00.000Z',
      releaseUrl: null,
      checksum: null,
      status: 'ready',
      errorMessage: null
    },
    'claude-agent-acp': {
      source: 'managed',
      binaryPath: '/managed/bin/claude-agent-acp',
      version: 'claude-agent-acp 0.22.2',
      installedAt: '2026-03-20T00:00:00.000Z',
      lastCheckedAt: '2026-03-20T00:00:00.000Z',
      releaseUrl: null,
      checksum: null,
      status: 'ready',
      errorMessage: null
    }
  }

  it('fills workspace path from system folder picker', async () => {
    const onSelectWorkspacePath = vi.fn().mockResolvedValue('/Users/windht/Dev')

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={{}}
            onSubmit={() => undefined}
            onSelectWorkspacePath={onSelectWorkspacePath}
          />
        </MemoryRouter>
      )
    })

    const browseButton = findButtonByText(container, 'Browse')
    await act(async () => {
      browseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const workspaceInput = container.querySelector(
      '#assistant-workspace-path'
    ) as HTMLInputElement | null
    expect(onSelectWorkspacePath).toHaveBeenCalledTimes(1)
    expect(workspaceInput?.value).toBe('/Users/windht/Dev')
  })

  it('uses flex column layout for tab navigation spacing', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor providers={[provider]} mcpServers={{}} onSubmit={() => undefined} />
        </MemoryRouter>
      )
    })

    const tabNav = container.querySelector('aside')
    expect(tabNav).not.toBeNull()
    expect(tabNav?.className).toContain('flex')
    expect(tabNav?.className).toContain('flex-col')
    expect(tabNav?.className).toContain('gap-1')
  })

  it('includes prompt instructions in submit payload', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={{}}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: 'Routes travel bookings and itinerary work.',
              instructions: 'Original prompt',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      )
    })

    const promptInput = container.querySelector('#assistant-prompt') as HTMLTextAreaElement | null
    const descriptionInput = container.querySelector(
      '#assistant-description'
    ) as HTMLTextAreaElement | null
    expect(promptInput).not.toBeNull()
    expect(descriptionInput?.value).toBe('Routes travel bookings and itinerary work.')

    const submitButton = findButtonByText(container, 'Update Assistant')
    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Routes travel bookings and itinerary work.',
        instructions: 'Original prompt'
      }),
      null
    )
  })

  it('loads heartbeat config for the selected assistant', async () => {
    vi.mocked(getAssistantHeartbeat).mockResolvedValue({
      id: 'heartbeat-1',
      assistantId: 'assistant-1',
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review recent work and recent conversations every 30 minutes.',
      threadId: 'thread-1',
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      lastError: null,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z'
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={{}}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={() => undefined}
          />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(getAssistantHeartbeat).toHaveBeenCalledWith('assistant-1')

    const heartbeatToggle = container.querySelector(
      '[aria-label="Enable heartbeat"]'
    ) as HTMLButtonElement | null
    const intervalInput = container.querySelector(
      '#assistant-heartbeat-interval'
    ) as HTMLInputElement | null
    const promptTextarea = container.querySelector(
      '#assistant-heartbeat-prompt'
    ) as HTMLTextAreaElement | null

    expect(heartbeatToggle?.getAttribute('aria-checked')).toBe('true')
    expect(intervalInput?.value).toBe('30')
    expect(promptTextarea?.value).toBe(
      'Review recent work and recent conversations every 30 minutes.'
    )
  })

  it('hides studio-only tabs for ACP agents until the user upgrades them', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={{}}
            initialValue={{
              id: 'assistant-acp',
              name: 'ACP Planner',
              description: '',
              instructions: '',
              enabled: true,
              origin: 'external-acp',
              studioFeaturesEnabled: false,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            showActivityTab
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Upgrade to TIA Agent')
    expect(container.textContent).not.toContain('Coding')
    expect(container.textContent).not.toContain('Tools')
    expect(container.textContent).not.toContain('Skills')
    expect(container.textContent).not.toContain('Activity')
    expect(container.textContent).not.toContain('Enable heartbeat')

    const upgradeButton = findButtonByText(container, 'Enable Studio Features')
    await act(async () => {
      upgradeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Coding')
    expect(container.textContent).toContain('Tools')
    expect(container.textContent).toContain('Skills')
    expect(container.textContent).toContain('Activity')
    expect(container.textContent).toContain('Enable heartbeat')

    const submitButton = findButtonByText(container, 'Update Assistant')
    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'external-acp',
        studioFeaturesEnabled: true
      }),
      null
    )
  })

  it('shows configured MCP servers when the tools tab opens', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={mcpServers}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={() => undefined}
          />
        </MemoryRouter>
      )
    })

    const toolsButton = findButtonByText(container, 'Tools')
    await act(async () => {
      toolsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Docs Server')
    expect(container.textContent).toContain('GitHub Server')
    expect(container.textContent).toContain('Disabled globally in MCP Server Settings.')
  })

  it('renders channel setup actions inside the channels tab', async () => {
    const channels: ConfiguredClawChannelRecord[] = [
      {
        id: 'channel-1',
        type: 'wechat',
        name: 'WeChat Support',
        assistantId: 'assistant-1',
        assistantName: 'Planner',
        status: 'connected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 0
      }
    ]
    const onOpenSetup = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={{}}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            channels={{
              currentAssistantId: 'assistant-1',
              channels,
              selectedChannelId: 'channel-1',
              isMutating: false,
              errorMessage: null,
              onSelectedChannelChange: vi.fn(),
              onCreateChannel: vi.fn(async () => channels[0]),
              onUpdateChannel: vi.fn(async () => channels[0]),
              onDeleteChannel: vi.fn(async () => undefined)
            }}
            channelSetupAction={{
              label: 'Open Setup',
              onOpen: onOpenSetup
            }}
            onSubmit={() => undefined}
          />
        </MemoryRouter>
      )
    })

    const channelsButton = findButtonByText(container, 'Channels')
    await act(async () => {
      channelsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('WeChat Support')
    const openSetupButton = findButtonByText(container, 'Open Setup')
    await act(async () => {
      openSetupButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenSetup).toHaveBeenCalledTimes(1)
  })

  it('shows runtime setup guidance for runtime-backed MCP tools', async () => {
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:3456',
        authToken: 'token'
      })),
      getManagedRuntimeStatus: vi.fn(async () => missingManagedRuntimes),
      pickDirectory: vi.fn(async () => null)
    }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={mcpServers}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={() => undefined}
          />
        </MemoryRouter>
      )
    })

    const toolsButton = findButtonByText(container, 'Tools')
    await act(async () => {
      toolsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Runtime Setup')
    expect(container.textContent).toContain('managed runtimes')
  })

  it('includes tool toggles in the submit payload', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={mcpServers}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      )
    })

    const toolsButton = findButtonByText(container, 'Tools')
    await act(async () => {
      toolsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const docsToggle = container.querySelector(
      '[aria-label="Toggle docs for this assistant"]'
    ) as HTMLButtonElement | null
    expect(docsToggle).not.toBeNull()

    await act(async () => {
      docsToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const submitButton = findButtonByText(container, 'Update Assistant')
    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpConfig: {
          docs: true,
          github: false
        }
      }),
      null
    )
  })

  it('stores coding agent configuration inside the workspace config', async () => {
    const onSubmit = vi.fn(async () => undefined)
    window.tiaDesktop.getManagedRuntimeStatus = vi.fn(async () => readyCodingManagedRuntimes)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider, codingProvider, claudeCodingProvider]}
            mcpServers={{}}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const codingButton = findButtonByText(container, 'Coding')
    await act(async () => {
      codingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const codingToggle = container.querySelector(
      '[aria-label="Enable Codex ACP"]'
    ) as HTMLButtonElement | null
    expect(codingToggle).not.toBeNull()

    await act(async () => {
      codingToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const codingProviderSelect = container.querySelector(
      '#assistant-coding-provider-codex-acp'
    ) as HTMLSelectElement | null
    expect(codingProviderSelect).not.toBeNull()

    await act(async () => {
      if (codingProviderSelect) {
        setSelectValue(codingProviderSelect, 'provider-coding')
      }
    })

    const submitButton = findButtonByText(container, 'Update Assistant')
    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceConfig: {
          rootPath: '/Users/windht/Dev/tia-studio',
          codingAgents: {
            'codex-acp': {
              enabled: true,
              providerId: 'provider-coding'
            }
          }
        }
      }),
      null
    )
  })

  it('submits heartbeat edits while preserving existing assistant fields', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor
            providers={[provider]}
            mcpServers={{}}
            initialValue={{
              id: 'assistant-1',
              name: 'Planner',
              description: 'Routes travel bookings and itinerary work.',
              instructions: 'Original prompt',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: { rootPath: '/Users/windht/Dev' },
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-02T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z'
            }}
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const heartbeatToggle = container.querySelector(
      '[aria-label="Enable heartbeat"]'
    ) as HTMLButtonElement | null
    const intervalInput = container.querySelector(
      '#assistant-heartbeat-interval'
    ) as HTMLInputElement | null
    const promptTextarea = container.querySelector(
      '#assistant-heartbeat-prompt'
    ) as HTMLTextAreaElement | null

    await act(async () => {
      heartbeatToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      if (intervalInput) {
        setInputValue(intervalInput, '45')
      }

      if (promptTextarea) {
        setInputValue(
          promptTextarea,
          'Review recent work and recent conversations every 45 minutes.'
        )
      }
    })

    const submitButton = findButtonByText(container, 'Update Assistant')
    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Planner',
        description: 'Routes travel bookings and itinerary work.',
        instructions: 'Original prompt',
        providerId: 'provider-1',
        workspaceConfig: {
          rootPath: '/Users/windht/Dev'
        }
      }),
      {
        enabled: true,
        intervalMinutes: 45,
        prompt: 'Review recent work and recent conversations every 45 minutes.'
      }
    )
  })

  it('keeps the tab panel at a fixed height while switching sections', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantEditor providers={[provider]} mcpServers={{}} onSubmit={() => undefined} />
        </MemoryRouter>
      )
    })

    const panel = container.querySelector(
      '[data-testid="assistant-editor-panel"]'
    ) as HTMLDivElement | null
    expect(panel).not.toBeNull()
    expect(panel?.className).toContain('h-[32rem]')
    expect(panel?.className).toContain('overflow-y-auto')
  })
})

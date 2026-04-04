// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../../lib/query-client'

const mockState = vi.hoisted(() => ({
  assistantsData: [] as Array<Record<string, unknown>>,
  providersData: [] as Array<Record<string, unknown>>,
  listInstalledLocalAcpAgentsMock: vi.fn(),
  getMcpServersSettingsMock: vi.fn(),
  syncInstalledLocalAcpAgentsMock: vi.fn(),
  createAssistantMock: vi.fn(),
  updateAssistantMutationMock: vi.fn()
}))

vi.mock('../../assistants/assistants-query', () => ({
  assistantKeys: {
    all: ['assistants'],
    lists: () => ['assistants', 'list']
  },
  updateAssistant: vi.fn(),
  useAssistants: () => ({
    data: mockState.assistantsData,
    isLoading: false
  }),
  useCreateAssistant: () => ({
    isPending: false,
    mutateAsync: mockState.createAssistantMock
  }),
  useUpdateAssistant: () => ({
    isPending: false,
    mutateAsync: mockState.updateAssistantMutationMock
  })
}))

vi.mock('../../assistants/assistant-heartbeat-query', () => ({
  updateAssistantHeartbeat: vi.fn()
}))

vi.mock('../../assistants/default-workspace-path-query', () => ({
  resolveDefaultAssistantWorkspacePath: vi.fn(async (assistantName: string) => `/tmp/${assistantName}`)
}))

vi.mock('../../assistants/local-acp-assistant-sync', () => ({
  readAssistantWorkspaceRootPath: (workspaceConfig: Record<string, unknown> | null | undefined) => {
    const value = workspaceConfig?.rootPath
    return typeof value === 'string' && value.length > 0 ? value : null
  },
  readAutoLocalAcpAgentCommand: (
    workspaceConfig: Record<string, unknown> | null | undefined
  ) => {
    const value = workspaceConfig?.__tiaAutoLocalAcpAgentCommand
    return typeof value === 'string' && value.length > 0 ? value : null
  },
  readAutoLocalAcpAgentKey: (workspaceConfig: Record<string, unknown> | null | undefined) => {
    const value = workspaceConfig?.__tiaAutoLocalAcpAgentKey
    return typeof value === 'string' && value.length > 0 ? value : null
  },
  syncInstalledLocalAcpAgents: (...args: unknown[]) => mockState.syncInstalledLocalAcpAgentsMock(...args)
}))

vi.mock('../../claws/components/assistant-management-dialog', () => ({
  AssistantManagementDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="assistant-management-dialog">Dialog</div> : null
}))

vi.mock('../mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: (...args: unknown[]) => mockState.getMcpServersSettingsMock(...args)
}))

vi.mock('../providers/providers-query', () => ({
  providerKeys: {
    all: ['providers'],
    lists: () => ['providers', 'list']
  },
  useProviders: () => ({
    data: mockState.providersData,
    isLoading: false
  })
}))

vi.mock('../../threads/local-acp-agents-query', () => ({
  listInstalledLocalAcpAgents: (...args: unknown[]) =>
    mockState.listInstalledLocalAcpAgentsMock(...args)
}))

import { AgentsSettingsPage } from './agents-settings-page'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AgentsSettingsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    queryClient.clear()
    mockState.createAssistantMock.mockReset()
    mockState.updateAssistantMutationMock.mockReset()
    mockState.listInstalledLocalAcpAgentsMock.mockReset()
    mockState.getMcpServersSettingsMock.mockReset()
    mockState.syncInstalledLocalAcpAgentsMock.mockReset()

    mockState.assistantsData = [
      {
        id: 'assistant-acp',
        name: 'Codex ACP',
        description: '',
        instructions: '',
        enabled: true,
        origin: 'external-acp',
        providerId: 'provider-acp',
        workspaceConfig: {
          rootPath: '/tmp/acp',
          __tiaAutoLocalAcpAgentKey: 'codex',
          __tiaAutoLocalAcpAgentCommand: 'codex --acp'
        },
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'assistant-tia',
        name: 'Planner',
        description: 'TIA planner',
        instructions: '',
        enabled: true,
        origin: 'tia',
        providerId: 'provider-openai',
        workspaceConfig: {
          rootPath: '/tmp/tia'
        },
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 42,
        memoryConfig: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ]
    mockState.providersData = [
      {
        id: 'provider-acp',
        name: 'ACP Provider',
        type: 'acp',
        apiKey: '',
        apiHost: 'acp://codex',
        selectedModel: 'default',
        providerModels: null,
        enabled: true,
        supportsVision: false,
        isBuiltIn: false,
        icon: null,
        officialSite: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: '',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5',
        providerModels: null,
        enabled: true,
        supportsVision: true,
        isBuiltIn: false,
        icon: null,
        officialSite: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ]
    mockState.listInstalledLocalAcpAgentsMock.mockResolvedValue([
      {
        key: 'codex',
        label: 'Codex ACP',
        resolvedCommand: 'codex --acp',
        binaryPath: '/usr/local/bin/codex'
      }
    ])
    mockState.getMcpServersSettingsMock.mockResolvedValue({ mcpServers: {} })
    mockState.syncInstalledLocalAcpAgentsMock.mockResolvedValue({
      providers: mockState.providersData,
      assistants: mockState.assistantsData,
      didMutate: false
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('renders the reverted split layout with a left rail and tab-driven detail pane', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings/agents']}>
          <AgentsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Workspace-linked ACP agents')
    expect(container.querySelector('[data-agent-row="assistant-acp"]')).not.toBeNull()
    expect(container.textContent).toContain('Workspace assignment')
    expect(container.textContent).not.toContain('Separate ACP agents from TIA agents')

    const tiaTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'TIA1'
    )
    expect(tiaTab).toBeDefined()

    await act(async () => {
      tiaTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('TIA-native assistant setup')
    expect(container.querySelector('[data-agent-row="assistant-tia"]')).not.toBeNull()
    expect(container.textContent).toContain('Edit TIA Agent')
    expect(container.textContent).toContain('Open Chat')
  })
})

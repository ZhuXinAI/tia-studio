// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEditor } from './assistant-editor'
import type { ProviderRecord } from '../settings/providers/providers-query'
import type { ManagedRuntimesState } from '../settings/runtimes/managed-runtimes-query'

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )

  if (!button) {
    throw new Error(`Could not find button with text: ${text}`)
  }

  return button
}

describe('assistant editor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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
  const missingManagedRuntimes: ManagedRuntimesState = {
    bun: {
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'missing',
      errorMessage: null
    },
    uv: {
      source: 'none',
      binaryPath: null,
      version: null,
      installedAt: null,
      lastCheckedAt: null,
      releaseUrl: null,
      checksum: null,
      status: 'missing',
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
      })
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
      })
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

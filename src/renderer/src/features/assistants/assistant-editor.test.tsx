// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEditor } from './assistant-editor'
import type { ProviderRecord } from '../settings/providers/providers-query'

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

  it('fills workspace path from system folder picker', async () => {
    const onSelectWorkspacePath = vi.fn().mockResolvedValue('/Users/windht/Dev')

    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          mcpServers={{}}
          onSubmit={() => undefined}
          onSelectWorkspacePath={onSelectWorkspacePath}
        />
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
        <AssistantEditor providers={[provider]} mcpServers={{}} onSubmit={() => undefined} />
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
        <AssistantEditor
          providers={[provider]}
          mcpServers={{}}
          initialValue={{
            id: 'assistant-1',
            name: 'Planner',
            instructions: 'Original prompt',
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
      )
    })

    const promptInput = container.querySelector('#assistant-prompt') as HTMLTextAreaElement | null
    expect(promptInput).not.toBeNull()

    const submitButton = findButtonByText(container, 'Update Assistant')
    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: 'Original prompt'
      })
    )
  })

  it('shows configured MCP servers when the tools tab opens', async () => {
    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          mcpServers={mcpServers}
          initialValue={{
            id: 'assistant-1',
            name: 'Planner',
            instructions: '',
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

  it('includes tool toggles in the submit payload', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          mcpServers={mcpServers}
          initialValue={{
            id: 'assistant-1',
            name: 'Planner',
            instructions: '',
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
        <AssistantEditor providers={[provider]} mcpServers={{}} onSubmit={() => undefined} />
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

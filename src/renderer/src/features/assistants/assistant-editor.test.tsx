// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEditor } from './assistant-editor'
import type { ProviderRecord } from '../settings/providers/providers-query'
import { listAssistantSkills, removeAssistantWorkspaceSkill } from './assistant-skills-query'

vi.mock('./assistant-skills-query', () => ({
  listAssistantSkills: vi.fn(),
  removeAssistantWorkspaceSkill: vi.fn()
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

  it('loads skills from configured directories when skills tab opens', async () => {
    vi.mocked(listAssistantSkills).mockResolvedValue([
      {
        id: 'global-claude:research-helper',
        name: 'Research Helper',
        description: 'Search docs and summarize findings.',
        source: 'global-claude',
        sourceRootPath: '/Users/windht/.claude/skills',
        directoryPath: '/Users/windht/.claude/skills/research-helper',
        relativePath: 'research-helper',
        skillFilePath: '/Users/windht/.claude/skills/research-helper/SKILL.md',
        canDelete: false
      },
      {
        id: 'workspace:lint-rules',
        name: 'Lint Rules',
        description: 'Enforces linting patterns.',
        source: 'workspace',
        sourceRootPath: '/Users/windht/Dev/tia-studio/skills',
        directoryPath: '/Users/windht/Dev/tia-studio/skills/lint-rules',
        relativePath: 'lint-rules',
        skillFilePath: '/Users/windht/Dev/tia-studio/skills/lint-rules/SKILL.md',
        canDelete: true
      }
    ])

    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          mcpServers={{}}
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

    const skillsButton = findButtonByText(container, 'Skills')
    await act(async () => {
      skillsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(listAssistantSkills).toHaveBeenCalledWith('/Users/windht/Dev/tia-studio')
    expect(container.textContent).toContain('Research Helper')
    expect(container.textContent).toContain('Lint Rules')
  })

  it('removes workspace skill folders from the skills tab', async () => {
    vi.mocked(listAssistantSkills)
      .mockResolvedValueOnce([
        {
          id: 'workspace:lint-rules',
          name: 'Lint Rules',
          description: 'Enforces linting patterns.',
          source: 'workspace',
          sourceRootPath: '/Users/windht/Dev/tia-studio/skills',
          directoryPath: '/Users/windht/Dev/tia-studio/skills/lint-rules',
          relativePath: 'lint-rules',
          skillFilePath: '/Users/windht/Dev/tia-studio/skills/lint-rules/SKILL.md',
          canDelete: true
        }
      ])
      .mockResolvedValueOnce([])
    vi.mocked(removeAssistantWorkspaceSkill).mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          mcpServers={{}}
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

    const skillsButton = findButtonByText(container, 'Skills')
    await act(async () => {
      skillsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    const removeButton = container.querySelector(
      '[aria-label="Remove skill Lint Rules"]'
    ) as HTMLButtonElement | null
    expect(removeButton).not.toBeNull()

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(removeAssistantWorkspaceSkill).toHaveBeenCalledWith({
      workspaceRootPath: '/Users/windht/Dev/tia-studio',
      relativePath: 'lint-rules'
    })
    expect(listAssistantSkills).toHaveBeenCalledTimes(2)
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

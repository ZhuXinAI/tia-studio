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

  it('fills workspace path from system folder picker', async () => {
    const provider: ProviderRecord = {
      id: 'provider-1',
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      apiHost: 'https://api.openai.com/v1',
      selectedModel: 'gpt-5',
      providerModels: null,
      enabled: true,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }

    const onSelectWorkspacePath = vi.fn().mockResolvedValue('/Users/windht/Dev')

    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          onSubmit={() => undefined}
          onSelectWorkspacePath={onSelectWorkspacePath}
        />
      )
    })

    const browseButton = findButtonByText(container, 'Browse')
    await act(async () => {
      browseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const workspaceInput = container.querySelector('#assistant-workspace-path') as HTMLInputElement | null
    expect(onSelectWorkspacePath).toHaveBeenCalledTimes(1)
    expect(workspaceInput?.value).toBe('/Users/windht/Dev')
  })

  it('includes prompt instructions in submit payload', async () => {
    const provider: ProviderRecord = {
      id: 'provider-1',
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      apiHost: 'https://api.openai.com/v1',
      selectedModel: 'gpt-5',
      providerModels: null,
      enabled: true,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <AssistantEditor
          providers={[provider]}
          initialValue={{
            id: 'assistant-1',
            name: 'Planner',
            instructions: 'Original prompt',
            providerId: 'provider-1',
            workspaceConfig: { rootPath: '/Users/windht/Dev' },
            skillsConfig: {},
            mcpConfig: {},
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
})

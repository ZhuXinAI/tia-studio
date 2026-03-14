// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamConfigDialog } from './team-config-dialog'

let container: HTMLDivElement
let root: Root

describe('TeamConfigDialog', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('validates missing supervisor settings and missing members', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <TeamConfigDialog
          isOpen
          workspace={{
            id: 'workspace-1',
            name: 'Docs Workspace',
            rootPath: '/Users/demo/project',
            teamDescription: '',
            supervisorProviderId: null,
            supervisorModel: '',
            createdAt: '2026-03-07T00:00:00.000Z',
            updatedAt: '2026-03-07T00:00:00.000Z'
          }}
          providers={[
            {
              id: 'provider-1',
              name: 'OpenAI',
              type: 'openai',
              apiKey: 'secret',
              apiHost: null,
              selectedModel: 'gpt-5',
              providerModels: null,
              enabled: true,
              supportsVision: false,
              isBuiltIn: false,
              icon: null,
              officialSite: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          assistants={[
            {
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: {},
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          selectedAssistantIds={[]}
          isSaving={false}
          errorMessage={null}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      )
    })

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save Team')
    )

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Select a supervisor provider.')
    expect(container.textContent).toContain('Enter a supervisor model.')
    expect(container.textContent).toContain('Select at least one team member.')
    expect(container.textContent).not.toContain('Thread Title')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the configured provider, model, and selected members', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <TeamConfigDialog
          isOpen
          workspace={{
            id: 'workspace-1',
            name: 'Docs Workspace',
            rootPath: '/Users/demo/project',
            teamDescription: '',
            supervisorProviderId: 'provider-1',
            supervisorModel: 'gpt-5',
            createdAt: '2026-03-07T00:00:00.000Z',
            updatedAt: '2026-03-07T00:00:00.000Z'
          }}
          providers={[
            {
              id: 'provider-1',
              name: 'OpenAI',
              type: 'openai',
              apiKey: 'secret',
              apiHost: null,
              selectedModel: 'gpt-5',
              providerModels: null,
              enabled: true,
              supportsVision: false,
              isBuiltIn: false,
              icon: null,
              officialSite: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          assistants={[
            {
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: {},
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          selectedAssistantIds={['assistant-1']}
          isSaving={false}
          errorMessage={null}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      )
    })

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save Team')
    )

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith({
      teamDescription: '',
      supervisorProviderId: 'provider-1',
      supervisorModel: 'gpt-5',
      assistantIds: ['assistant-1']
    })
  })

  it('skips manual member selection for the built-in default team', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <TeamConfigDialog
          isOpen
          workspace={{
            id: 'workspace-1',
            name: 'Default Team',
            rootPath: '/Users/demo/default_root/default_team',
            teamDescription: '',
            supervisorProviderId: 'provider-1',
            supervisorModel: 'gpt-5',
            isBuiltInDefault: true,
            createdAt: '2026-03-07T00:00:00.000Z',
            updatedAt: '2026-03-07T00:00:00.000Z'
          }}
          providers={[
            {
              id: 'provider-1',
              name: 'OpenAI',
              type: 'openai',
              apiKey: 'secret',
              apiHost: null,
              selectedModel: 'gpt-5',
              providerModels: null,
              enabled: true,
              supportsVision: false,
              isBuiltIn: false,
              icon: null,
              officialSite: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          assistants={[
            {
              id: 'assistant-1',
              name: 'Planner',
              description: '',
              instructions: '',
              enabled: true,
              providerId: 'provider-1',
              workspaceConfig: {},
              skillsConfig: {},
              mcpConfig: {},
              maxSteps: 100,
              memoryConfig: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          selectedAssistantIds={[]}
          isSaving={false}
          errorMessage={null}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      )
    })

    expect(container.textContent).not.toContain('Team Members')

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save Team')
    )

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('Select at least one team member.')
    expect(onSubmit).toHaveBeenCalledWith({
      teamDescription: '',
      supervisorProviderId: 'provider-1',
      supervisorModel: 'gpt-5',
      assistantIds: ['assistant-1']
    })
  })
})

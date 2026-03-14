// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupConfigDialog } from './group-config-dialog'

let container: HTMLDivElement
let root: Root

describe('GroupConfigDialog', () => {
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

  it('validates missing group name and members during creation', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <GroupConfigDialog
          mode="create"
          isOpen
          group={null}
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
              createdAt: '2026-03-13T00:00:00.000Z',
              updatedAt: '2026-03-13T00:00:00.000Z'
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
      button.textContent?.includes('Create Group')
    )

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Enter a group name.')
    expect(container.textContent).toContain('Select at least one group member.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the configured group details in edit mode', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <GroupConfigDialog
          mode="edit"
          isOpen
          group={{
            id: 'group-1',
            name: 'Launch Group',
            rootPath: '',
            groupDescription: 'Plan the launch.',
            maxAutoTurns: 5,
            createdAt: '2026-03-13T00:00:00.000Z',
            updatedAt: '2026-03-13T00:00:00.000Z'
          }}
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
              createdAt: '2026-03-13T00:00:00.000Z',
              updatedAt: '2026-03-13T00:00:00.000Z'
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
      button.textContent?.includes('Save Group')
    )

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Launch Group',
      groupDescription: 'Plan the launch.',
      maxAutoTurns: 5,
      assistantIds: ['assistant-1']
    })
  })
})

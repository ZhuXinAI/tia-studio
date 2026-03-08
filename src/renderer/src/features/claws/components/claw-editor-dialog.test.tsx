// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClawEditorDialog } from './claw-editor-dialog'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setElementValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  setter?.call(element, value)
  element.dispatchEvent(
    new Event(
      element instanceof HTMLSelectElement ? 'change' : 'input',
      { bubbles: true }
    )
  )
}

describe('ClawEditorDialog', () => {
  let container: HTMLDivElement
  let root: Root

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
    document.body.innerHTML = ''
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('submits a new claw with inline lark channel fields', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={null}
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
              createdAt: '2026-03-08T00:00:00.000Z',
              updatedAt: '2026-03-08T00:00:00.000Z'
            }
          ]}
          availableChannels={[]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      )
    })
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="claw-name"]') as HTMLInputElement
    const providerSelect = body.querySelector('select[id="claw-provider"]') as HTMLSelectElement
    const instructionsInput = body.querySelector(
      'textarea[id="claw-instructions"]'
    ) as HTMLTextAreaElement
    const channelNameInput = body.querySelector(
      'input[id="claw-channel-name"]'
    ) as HTMLInputElement
    const appIdInput = body.querySelector('input[id="claw-channel-app-id"]') as HTMLInputElement
    const appSecretInput = body.querySelector(
      'input[id="claw-channel-app-secret"]'
    ) as HTMLInputElement
    const saveButton = Array.from(body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Claw')
    )

    await act(async () => {
      setElementValue(nameInput, 'Ops Assistant')
      setElementValue(providerSelect, 'provider-1')
      setElementValue(instructionsInput, 'Handle ops.')
      setElementValue(channelNameInput, 'Ops Lark')
      setElementValue(appIdInput, 'cli_ops')
      setElementValue(appSecretInput, 'secret-ops')
    })

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        instructions: 'Handle ops.',
        enabled: true
      },
      channel: {
        mode: 'create',
        type: 'lark',
        name: 'Ops Lark',
        appId: 'cli_ops',
        appSecret: 'secret-ops'
      }
    })
  })

  it('shows only unbound channels in attach mode', async () => {
    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={{
            id: 'assistant-1',
            name: 'Ops Assistant',
            description: '',
            instructions: '',
            providerId: 'provider-1',
            enabled: true,
            channel: {
              id: 'channel-bound',
              type: 'lark',
              name: 'Bound Lark',
              status: 'connected',
              errorMessage: null
            }
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
              createdAt: '2026-03-08T00:00:00.000Z',
              updatedAt: '2026-03-08T00:00:00.000Z'
            }
          ]}
          availableChannels={[
            {
              id: 'channel-free',
              type: 'lark',
              name: 'Free Lark'
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={vi.fn(async () => undefined)}
        />
      )
    })
    await flushAsyncWork()

    const body = document.body
    const actionSelect = body.querySelector('select[id="claw-channel-action"]') as HTMLSelectElement

    await act(async () => {
      setElementValue(actionSelect, 'attach')
    })
    await flushAsyncWork()

    const attachSelect = body.querySelector(
      'select[id="claw-existing-channel"]'
    ) as HTMLSelectElement
    const optionValues = Array.from(attachSelect.options).map((option) => option.value)

    expect(optionValues).toContain('channel-free')
    expect(optionValues).not.toContain('channel-bound')
  })
})

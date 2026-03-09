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
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true
    })
  )
}

const provider = {
  id: 'provider-1',
  name: 'OpenAI',
  type: 'openai' as const,
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

  it('submits a new claw without a selected channel as assistant-only and disabled', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={null}
          providers={[provider]}
          configuredChannels={[]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
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
    const saveButton = Array.from(body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Claw')
    )

    await act(async () => {
      setElementValue(nameInput, 'Ops Assistant')
      setElementValue(providerSelect, 'provider-1')
      setElementValue(instructionsInput, 'Handle ops.')
    })

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(body.querySelector('select[id="claw-channel-action"]')).toBeNull()
    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        instructions: 'Handle ops.',
        enabled: false
      }
    })
  })

  it('submits detach when an existing claw clears its channel', async () => {
    const onSubmit = vi.fn(async () => undefined)

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
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              status: 'connected',
              errorMessage: null
            }
          }}
          providers={[provider]}
          configuredChannels={[
            {
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              assistantId: 'assistant-1',
              assistantName: 'Ops Assistant',
              status: 'connected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
        />
      )
    })
    await flushAsyncWork()

    const openSelectorButton = document.body.querySelector(
      'button[id="claw-select-channel-button"]'
    ) as HTMLButtonElement

    await act(async () => {
      openSelectorButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const clearButton = document.body.querySelector(
      'button[id="claw-channel-selector-clear"]'
    ) as HTMLButtonElement
    const applyButton = document.body.querySelector(
      'button[id="claw-channel-selector-apply"]'
    ) as HTMLButtonElement

    await act(async () => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    await act(async () => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const saveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save Claw')
    )

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        instructions: '',
        enabled: false
      },
      channel: {
        mode: 'detach'
      }
    })
  })

  it('submits attach when the selected channel changes', async () => {
    const onSubmit = vi.fn(async () => undefined)

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
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              status: 'connected',
              errorMessage: null
            }
          }}
          providers={[provider]}
          configuredChannels={[
            {
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              assistantId: 'assistant-1',
              assistantName: 'Ops Assistant',
              status: 'connected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            },
            {
              id: 'channel-free',
              type: 'telegram',
              name: 'Free Telegram',
              assistantId: null,
              assistantName: null,
              status: 'disconnected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
        />
      )
    })
    await flushAsyncWork()

    const openSelectorButton = document.body.querySelector(
      'button[id="claw-select-channel-button"]'
    ) as HTMLButtonElement

    await act(async () => {
      openSelectorButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const freeChannelButton = document.body.querySelector(
      'button[data-channel-id="channel-free"]'
    ) as HTMLButtonElement
    const applyButton = document.body.querySelector(
      'button[id="claw-channel-selector-apply"]'
    ) as HTMLButtonElement

    await act(async () => {
      freeChannelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    await act(async () => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const saveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save Claw')
    )

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        instructions: '',
        enabled: true
      },
      channel: {
        mode: 'attach',
        channelId: 'channel-free'
      }
    })
  })
})

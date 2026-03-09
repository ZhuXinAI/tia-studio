// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfiguredClawChannelRecord } from '../claws-query'
import { ClawChannelSelectorDialog } from './claw-channel-selector-dialog'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setElementValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  setter?.call(element, value)
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
  )
}

function buildChannel(
  overrides: Partial<ConfiguredClawChannelRecord>
): ConfiguredClawChannelRecord {
  return {
    id: 'channel-1',
    type: 'lark',
    name: 'Channel',
    assistantId: null,
    assistantName: null,
    status: 'disconnected',
    errorMessage: null,
    pairedCount: 0,
    pendingPairingCount: 0,
    ...overrides
  }
}

describe('ClawChannelSelectorDialog', () => {
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

  it('preselects the current channel and disables channels used by another assistant', async () => {
    await act(async () => {
      root.render(
        <ClawChannelSelectorDialog
          isOpen
          currentAssistantId="assistant-1"
          selectedChannelId="channel-self"
          channels={[
            buildChannel({
              id: 'channel-self',
              name: 'Current Telegram',
              type: 'telegram',
              assistantId: 'assistant-1',
              assistantName: 'Current claw',
              status: 'connected',
              pairedCount: 1
            }),
            buildChannel({
              id: 'channel-other',
              name: 'Claimed Lark',
              assistantId: 'assistant-2',
              assistantName: 'Another claw',
              status: 'connected'
            })
          ]}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onUpdateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onDeleteChannel={vi.fn(async () => undefined)}
        />
      )
    })
    await flushAsyncWork()

    const currentButton = document.body.querySelector(
      'button[data-channel-id="channel-self"]'
    ) as HTMLButtonElement
    const claimedButton = document.body.querySelector(
      'button[data-channel-id="channel-other"]'
    ) as HTMLButtonElement

    expect(currentButton.getAttribute('data-selected')).toBe('true')
    expect(currentButton.textContent).toContain('Selected')
    expect(claimedButton.disabled).toBe(true)
  })

  it('clears the selection and applies an empty channel id', async () => {
    const onApply = vi.fn()

    await act(async () => {
      root.render(
        <ClawChannelSelectorDialog
          isOpen
          currentAssistantId="assistant-1"
          selectedChannelId="channel-self"
          channels={[
            buildChannel({
              id: 'channel-self',
              name: 'Current Lark',
              assistantId: 'assistant-1',
              assistantName: 'Current claw',
              status: 'connected'
            })
          ]}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={onApply}
          onCreateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onUpdateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onDeleteChannel={vi.fn(async () => undefined)}
        />
      )
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

    expect(onApply).toHaveBeenCalledWith('')
  })

  it('creates a new channel from the nested add dialog and selects it', async () => {
    const onCreateChannel = vi.fn(async () =>
      buildChannel({
        id: 'channel-new',
        type: 'telegram',
        name: 'New Telegram',
        status: 'disconnected'
      })
    )

    await act(async () => {
      root.render(
        <ClawChannelSelectorDialog
          isOpen
          currentAssistantId={null}
          selectedChannelId=""
          channels={[]}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateChannel={onCreateChannel}
          onUpdateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onDeleteChannel={vi.fn(async () => undefined)}
        />
      )
    })
    await flushAsyncWork()

    const addButton = document.body.querySelector(
      'button[id="claw-channel-selector-add"]'
    ) as HTMLButtonElement

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const createButton = document.body.querySelector(
      'button[id="claw-channel-create-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(document.body.querySelector('[id="claw-channel-create-error"]')).not.toBeNull()

    const typeSelect = document.body.querySelector(
      'select[id="claw-channel-create-type"]'
    ) as HTMLSelectElement
    const nameInput = document.body.querySelector(
      'input[id="claw-channel-create-name"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(typeSelect, 'telegram')
    })
    await flushAsyncWork()

    const botTokenInput = document.body.querySelector(
      'input[id="claw-channel-create-bot-token"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(nameInput, 'New Telegram')
      setElementValue(botTokenInput, '123456:test-token')
    })

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(onCreateChannel).toHaveBeenCalledWith({
      type: 'telegram',
      name: 'New Telegram',
      botToken: '123456:test-token'
    })

    const createdButton = document.body.querySelector(
      'button[data-channel-id="channel-new"]'
    ) as HTMLButtonElement
    expect(createdButton.getAttribute('data-selected')).toBe('true')
  })

  it('edits the selected channel from the nested form dialog', async () => {
    const onUpdateChannel = vi.fn(async (channelId: string) =>
      buildChannel({
        id: channelId,
        type: 'telegram',
        name: 'Updated Telegram',
        status: 'connected'
      })
    )

    await act(async () => {
      root.render(
        <ClawChannelSelectorDialog
          isOpen
          currentAssistantId="assistant-1"
          selectedChannelId="channel-self"
          channels={[
            buildChannel({
              id: 'channel-self',
              name: 'Current Telegram',
              type: 'telegram',
              assistantId: 'assistant-1',
              assistantName: 'Current claw',
              status: 'connected'
            })
          ]}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onUpdateChannel={onUpdateChannel}
          onDeleteChannel={vi.fn(async () => undefined)}
        />
      )
    })
    await flushAsyncWork()

    const editButton = document.body.querySelector(
      'button[id="claw-channel-selector-edit"]'
    ) as HTMLButtonElement

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const nameInput = document.body.querySelector(
      'input[id="claw-channel-form-name"]'
    ) as HTMLInputElement
    const tokenInput = document.body.querySelector(
      'input[id="claw-channel-form-bot-token"]'
    ) as HTMLInputElement
    const saveButton = document.body.querySelector(
      'button[id="claw-channel-form-save"]'
    ) as HTMLButtonElement

    expect(nameInput.value).toBe('Current Telegram')

    await act(async () => {
      setElementValue(nameInput, 'Updated Telegram')
      setElementValue(tokenInput, '123456:updated-token')
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(onUpdateChannel).toHaveBeenCalledWith('channel-self', {
      type: 'telegram',
      name: 'Updated Telegram',
      botToken: '123456:updated-token'
    })

    const updatedButton = document.body.querySelector(
      'button[data-channel-id="channel-self"]'
    ) as HTMLButtonElement
    expect(updatedButton.textContent).toContain('Updated Telegram')
  })

  it('allows removing only unbound channels', async () => {
    const onDeleteChannel = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawChannelSelectorDialog
          isOpen
          currentAssistantId="assistant-1"
          selectedChannelId="channel-bound"
          channels={[
            buildChannel({
              id: 'channel-bound',
              name: 'Current Lark',
              assistantId: 'assistant-1',
              assistantName: 'Current claw',
              status: 'connected'
            }),
            buildChannel({
              id: 'channel-free',
              name: 'Free Lark',
              assistantId: null
            })
          ]}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onUpdateChannel={vi.fn(async () => buildChannel({ id: 'unused' }))}
          onDeleteChannel={onDeleteChannel}
        />
      )
    })
    await flushAsyncWork()

    const removeButton = document.body.querySelector(
      'button[id="claw-channel-selector-remove"]'
    ) as HTMLButtonElement
    expect(removeButton.disabled).toBe(true)

    const freeChannelButton = document.body.querySelector(
      'button[data-channel-id="channel-free"]'
    ) as HTMLButtonElement

    await act(async () => {
      freeChannelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(removeButton.disabled).toBe(false)

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const confirmButton = document.body.querySelector(
      'button[id="claw-channel-remove-confirm"]'
    ) as HTMLButtonElement

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(onDeleteChannel).toHaveBeenCalledWith('channel-free')
    expect(document.body.querySelector('button[data-channel-id="channel-free"]')).toBeNull()
  })
})

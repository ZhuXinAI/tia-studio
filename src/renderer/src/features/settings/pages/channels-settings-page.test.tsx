// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelsSettingsPage } from './channels-settings-page'
import {
  createClawChannel,
  deleteClawChannel,
  listClaws,
  updateClawChannel,
  type ClawsResponse,
  type ConfiguredClawChannelRecord
} from '../../claws/claws-query'

vi.mock('../../claws/claws-query', () => ({
  createClawChannel: vi.fn(),
  deleteClawChannel: vi.fn(),
  listClaws: vi.fn(),
  updateClawChannel: vi.fn()
}))

function setElementValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  setter?.call(element, value)
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
  )
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function buildChannel(
  overrides: Partial<ConfiguredClawChannelRecord>
): ConfiguredClawChannelRecord {
  return {
    id: 'channel-1',
    type: 'lark',
    name: 'Ops Lark',
    assistantId: null,
    assistantName: null,
    status: 'disconnected',
    errorMessage: null,
    pairedCount: 0,
    pendingPairingCount: 0,
    ...overrides
  }
}

function buildResponse(channels: ConfiguredClawChannelRecord[]): ClawsResponse {
  return {
    claws: [],
    configuredChannels: channels
  }
}

describe('channels settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(listClaws).mockResolvedValue(buildResponse([buildChannel({})]))
    vi.mocked(createClawChannel).mockResolvedValue(
      buildChannel({
        id: 'channel-2',
        type: 'telegram',
        name: 'Ops Telegram'
      })
    )
    vi.mocked(updateClawChannel).mockResolvedValue(
      buildChannel({
        id: 'channel-1',
        name: 'Renamed Lark'
      })
    )
    vi.mocked(deleteClawChannel).mockResolvedValue(undefined)
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

  it('renders configured channels from claws data', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Configured Channels')
    expect(container.textContent).toContain('Ops Lark')
    expect(container.textContent).toContain('Add Channel')
  })

  it('creates a configured channel', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const addButton = container.querySelector(
      'button[id="settings-channels-add"]'
    ) as HTMLButtonElement

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const typeSelect = document.body.querySelector(
      'select[id="settings-channel-create-type"]'
    ) as HTMLSelectElement
    const nameInput = document.body.querySelector(
      'input[id="settings-channel-create-name"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(typeSelect, 'telegram')
    })
    await flushAsyncWork()

    const tokenInput = document.body.querySelector(
      'input[id="settings-channel-create-bot-token"]'
    ) as HTMLInputElement
    const saveButton = document.body.querySelector(
      'button[id="settings-channel-create-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(nameInput, 'Ops Telegram')
      setElementValue(tokenInput, '123456:test-token')
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'telegram',
      name: 'Ops Telegram',
      botToken: '123456:test-token'
    })
    expect(container.textContent).toContain('Ops Telegram')
  })

  it('creates a configured whatsapp channel without extra credentials', async () => {
    vi.mocked(createClawChannel).mockResolvedValueOnce(
      buildChannel({
        id: 'channel-whatsapp',
        type: 'whatsapp',
        name: 'Ops WhatsApp'
      })
    )

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const addButton = container.querySelector(
      'button[id="settings-channels-add"]'
    ) as HTMLButtonElement

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const typeSelect = document.body.querySelector(
      'select[id="settings-channel-create-type"]'
    ) as HTMLSelectElement
    const nameInput = document.body.querySelector(
      'input[id="settings-channel-create-name"]'
    ) as HTMLInputElement
    const saveButton = document.body.querySelector(
      'button[id="settings-channel-create-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(typeSelect, 'whatsapp')
      setElementValue(nameInput, 'Ops WhatsApp')
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'whatsapp',
      name: 'Ops WhatsApp'
    })
    expect(container.textContent).toContain('Ops WhatsApp')
  })

  it('creates a configured wecom channel with bot credentials', async () => {
    vi.mocked(createClawChannel).mockResolvedValueOnce(
      buildChannel({
        id: 'channel-wecom',
        type: 'wecom',
        name: 'Ops Wecom'
      })
    )

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const addButton = container.querySelector(
      'button[id="settings-channels-add"]'
    ) as HTMLButtonElement

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const typeSelect = document.body.querySelector(
      'select[id="settings-channel-create-type"]'
    ) as HTMLSelectElement
    const nameInput = document.body.querySelector(
      'input[id="settings-channel-create-name"]'
    ) as HTMLInputElement
    const botIdInput = document.body.querySelector(
      'input[id="settings-channel-create-app-id"]'
    ) as HTMLInputElement
    const secretInput = document.body.querySelector(
      'input[id="settings-channel-create-app-secret"]'
    ) as HTMLInputElement
    const saveButton = document.body.querySelector(
      'button[id="settings-channel-create-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(typeSelect, 'wecom')
      setElementValue(nameInput, 'Ops Wecom')
      setElementValue(botIdInput, 'bot-123')
      setElementValue(secretInput, 'secret-123')
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'wecom',
      name: 'Ops Wecom',
      botId: 'bot-123',
      secret: 'secret-123'
    })
    expect(container.textContent).toContain('Ops Wecom')
    expect(container.textContent).toContain('Wecom')
  })

  it('edits and removes an unbound configured channel', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const editButton = container.querySelector(
      'button[id="settings-channels-edit-channel-1"]'
    ) as HTMLButtonElement

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const nameInput = document.body.querySelector(
      'input[id="settings-channel-form-name"]'
    ) as HTMLInputElement
    const saveButton = document.body.querySelector(
      'button[id="settings-channel-form-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(nameInput, 'Renamed Lark')
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateClawChannel).toHaveBeenCalledWith('channel-1', {
      type: 'lark',
      name: 'Renamed Lark'
    })
    expect(container.textContent).toContain('Renamed Lark')

    const deleteButton = container.querySelector(
      'button[id="settings-channels-delete-channel-1"]'
    ) as HTMLButtonElement

    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const confirmButton = document.body.querySelector(
      'button[id="settings-channel-remove-confirm"]'
    ) as HTMLButtonElement

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(deleteClawChannel).toHaveBeenCalledWith('channel-1')
    expect(container.textContent).not.toContain('Renamed Lark')
  })
})

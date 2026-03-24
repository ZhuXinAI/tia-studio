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
    groupRequireMention: true,
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

    expect(
      document.body.querySelector('button[id="settings-channel-create-group-require-mention"]')
    ).toBeNull()

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

  it('creates a configured discord channel with mention gating controls', async () => {
    vi.mocked(createClawChannel).mockResolvedValueOnce(
      buildChannel({
        id: 'channel-discord',
        type: 'discord',
        name: 'Ops Discord',
        groupRequireMention: false
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
      setElementValue(typeSelect, 'discord')
    })
    await flushAsyncWork()

    const tokenInput = document.body.querySelector(
      'input[id="settings-channel-create-bot-token"]'
    ) as HTMLInputElement
    const mentionSwitch = document.body.querySelector(
      'button[id="settings-channel-create-group-require-mention"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(nameInput, 'Ops Discord')
      setElementValue(tokenInput, 'discord-test-token')
      mentionSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'discord',
      name: 'Ops Discord',
      botToken: 'discord-test-token',
      groupRequireMention: false
    })
    expect(container.textContent).toContain('Ops Discord')
  })

  it('lets the user disable group mention gating for supported channels', async () => {
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
      setElementValue(typeSelect, 'lark')
    })
    await flushAsyncWork()

    const appIdInput = document.body.querySelector(
      'input[id="settings-channel-create-app-id"]'
    ) as HTMLInputElement
    const appSecretInput = document.body.querySelector(
      'input[id="settings-channel-create-app-secret"]'
    ) as HTMLInputElement
    const mentionSwitch = document.body.querySelector(
      'button[id="settings-channel-create-group-require-mention"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(nameInput, 'Lark No Mention')
      setElementValue(appIdInput, 'cli_123')
      setElementValue(appSecretInput, 'secret_123')
      mentionSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'lark',
      name: 'Lark No Mention',
      appId: 'cli_123',
      appSecret: 'secret_123',
      groupRequireMention: false
    })
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
      name: 'Ops WhatsApp',
      groupRequireMention: true
    })
    expect(container.textContent).toContain('Ops WhatsApp')
  })

  it('creates a configured wechat channel without extra credentials', async () => {
    vi.mocked(createClawChannel).mockResolvedValueOnce(
      buildChannel({
        id: 'channel-wechat',
        type: 'wechat',
        name: 'Ops Wechat'
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
      setElementValue(typeSelect, 'wechat')
      setElementValue(nameInput, 'Ops Wechat')
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('Wechat login QR code')
    expect(
      document.body.querySelector('button[id="settings-channel-create-group-require-mention"]')
    ).toBeNull()

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'wechat',
      name: 'Ops Wechat'
    })
    expect(container.textContent).toContain('Ops Wechat')
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
      secret: 'secret-123',
      groupRequireMention: true
    })
    expect(container.textContent).toContain('Ops Wecom')
    expect(container.textContent).toContain('Wecom')
  })

  it('creates a configured wechat-kf channel with relay credentials', async () => {
    vi.mocked(createClawChannel).mockResolvedValueOnce(
      buildChannel({
        id: 'channel-wechat-kf',
        type: 'wechat-kf',
        name: 'Wechat Support'
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

    await act(async () => {
      setElementValue(typeSelect, 'wechat-kf')
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('wechat-kf-relay')
    expect(
      document.body.querySelector('button[id="settings-channel-create-group-require-mention"]')
    ).toBeNull()

    const serverUrlInput = document.body.querySelector(
      'input[id="settings-channel-create-server-url"]'
    ) as HTMLInputElement
    const serverKeyInput = document.body.querySelector(
      'input[id="settings-channel-create-server-key"]'
    ) as HTMLInputElement
    const saveButton = document.body.querySelector(
      'button[id="settings-channel-create-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(nameInput, 'Wechat Support')
      setElementValue(serverUrlInput, 'ws://127.0.0.1:3000/ws')
      setElementValue(serverKeyInput, 'relay-key')
    })

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'wechat-kf',
      name: 'Wechat Support',
      serverUrl: 'ws://127.0.0.1:3000/ws',
      serverKey: 'relay-key'
    })
    expect(container.textContent).toContain('Wechat Support')
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
      name: 'Renamed Lark',
      groupRequireMention: true
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

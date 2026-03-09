// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listProviders } from '../../settings/providers/providers-query'
import { ClawsPage } from './claws-page'
import {
  approveClawPairing,
  createClaw,
  deleteClaw,
  listClawPairings,
  listClaws,
  rejectClawPairing,
  revokeClawPairing,
  updateClaw
} from '../claws-query'

vi.mock('../../settings/providers/providers-query', () => ({
  listProviders: vi.fn()
}))

vi.mock('../claws-query', () => ({
  listClaws: vi.fn(),
  createClaw: vi.fn(),
  updateClaw: vi.fn(),
  deleteClaw: vi.fn(),
  listClawPairings: vi.fn(),
  approveClawPairing: vi.fn(),
  rejectClawPairing: vi.fn(),
  revokeClawPairing: vi.fn()
}))

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
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
  )
}

describe('ClawsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(listProviders).mockResolvedValue([
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
    ])
    vi.mocked(createClaw).mockResolvedValue({
      id: 'assistant-1',
      name: 'Ops Assistant',
      description: '',
      instructions: 'Handle ops.',
      providerId: 'provider-1',
      enabled: true,
      channel: {
        id: 'channel-1',
        type: 'lark',
        name: 'Ops Lark',
        status: 'connected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 0
      }
    })
    vi.mocked(updateClaw).mockResolvedValue({
      id: 'assistant-1',
      name: 'Ops Assistant',
      description: '',
      instructions: '',
      providerId: 'provider-1',
      enabled: false,
      channel: {
        id: 'channel-1',
        type: 'lark',
        name: 'Ops Lark',
        status: 'disconnected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 0
      }
    })
    vi.mocked(deleteClaw).mockResolvedValue(undefined)
    vi.mocked(listClawPairings).mockResolvedValue({
      pairings: [
        {
          id: 'pairing-pending',
          channelId: 'channel-telegram',
          remoteChatId: '1001',
          senderId: '1001',
          senderDisplayName: 'Alice',
          senderUsername: 'alice',
          code: 'AB7KQ2XM',
          status: 'pending',
          expiresAt: '2099-03-09T01:00:00.000Z',
          approvedAt: null,
          rejectedAt: null,
          revokedAt: null,
          lastSeenAt: '2026-03-09T00:00:00.000Z',
          createdAt: '2026-03-09T00:00:00.000Z',
          updatedAt: '2026-03-09T00:00:00.000Z'
        },
        {
          id: 'pairing-approved',
          channelId: 'channel-telegram',
          remoteChatId: '1002',
          senderId: '1002',
          senderDisplayName: 'Bob',
          senderUsername: 'bob',
          code: 'CD8LM9NP',
          status: 'approved',
          expiresAt: null,
          approvedAt: '2026-03-09T00:05:00.000Z',
          rejectedAt: null,
          revokedAt: null,
          lastSeenAt: '2026-03-09T00:10:00.000Z',
          createdAt: '2026-03-09T00:05:00.000Z',
          updatedAt: '2026-03-09T00:05:00.000Z'
        }
      ]
    })
    vi.mocked(approveClawPairing).mockResolvedValue({
      id: 'pairing-pending',
      channelId: 'channel-telegram',
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      status: 'approved',
      expiresAt: null,
      approvedAt: '2026-03-09T00:15:00.000Z',
      rejectedAt: null,
      revokedAt: null,
      lastSeenAt: '2026-03-09T00:00:00.000Z',
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:15:00.000Z'
    })
    vi.mocked(rejectClawPairing).mockResolvedValue({
      id: 'pairing-pending',
      channelId: 'channel-telegram',
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      status: 'rejected',
      expiresAt: null,
      approvedAt: null,
      rejectedAt: '2026-03-09T00:15:00.000Z',
      revokedAt: null,
      lastSeenAt: '2026-03-09T00:00:00.000Z',
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:15:00.000Z'
    })
    vi.mocked(revokeClawPairing).mockResolvedValue({
      id: 'pairing-approved',
      channelId: 'channel-telegram',
      remoteChatId: '1002',
      senderId: '1002',
      senderDisplayName: 'Bob',
      senderUsername: 'bob',
      code: 'CD8LM9NP',
      status: 'revoked',
      expiresAt: null,
      approvedAt: '2026-03-09T00:05:00.000Z',
      rejectedAt: null,
      revokedAt: '2026-03-09T00:20:00.000Z',
      lastSeenAt: '2026-03-09T00:10:00.000Z',
      createdAt: '2026-03-09T00:05:00.000Z',
      updatedAt: '2026-03-09T00:20:00.000Z'
    })
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

  it('renders onboarding when no claws are connected yet', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [],
      availableChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Claws')
    expect(container.textContent).toContain('Set up your first claw')
    expect(container.textContent).toContain('Create Your First Claw')
  })

  it('renders existing claw cards', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-1',
          name: 'Ops Assistant',
          description: '',
          instructions: '',
          providerId: 'provider-1',
          enabled: true,
          channel: {
            id: 'channel-1',
            type: 'lark',
            name: 'Ops Lark',
            status: 'connected',
            errorMessage: null,
            pairedCount: 0,
            pendingPairingCount: 0
          }
        }
      ],
      availableChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Ops Assistant')
    expect(container.textContent).toContain('Ops Lark')
    expect(container.textContent).toContain('Disable')
    expect(container.textContent).toContain('New Claw')
  })

  it('creates a claw from the onboarding dialog', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [],
      availableChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Your First Claw')
    )

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="claw-name"]') as HTMLInputElement
    const providerSelect = body.querySelector('select[id="claw-provider"]') as HTMLSelectElement
    const instructionsInput = body.querySelector(
      'textarea[id="claw-instructions"]'
    ) as HTMLTextAreaElement
    const channelNameInput = body.querySelector('input[id="claw-channel-name"]') as HTMLInputElement
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

    expect(createClaw).toHaveBeenCalledWith({
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

  it('creates a telegram claw from the onboarding dialog', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [],
      availableChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Your First Claw')
    )

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="claw-name"]') as HTMLInputElement
    const providerSelect = body.querySelector('select[id="claw-provider"]') as HTMLSelectElement
    const channelTypeSelect = body.querySelector(
      'select[id="claw-channel-type"]'
    ) as HTMLSelectElement
    const channelNameInput = body.querySelector('input[id="claw-channel-name"]') as HTMLInputElement
    const saveButton = Array.from(body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Claw')
    )

    await act(async () => {
      setElementValue(nameInput, 'Telegram Assistant')
      setElementValue(providerSelect, 'provider-1')
      setElementValue(channelTypeSelect, 'telegram')
      setElementValue(channelNameInput, 'Telegram Bot')
    })
    await flushAsyncWork()

    const botTokenInput = body.querySelector(
      'input[id="claw-channel-bot-token"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(botTokenInput, '123456:test-token')
    })

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createClaw).toHaveBeenCalledWith({
      assistant: {
        name: 'Telegram Assistant',
        providerId: 'provider-1',
        instructions: '',
        enabled: true
      },
      channel: {
        mode: 'create',
        type: 'telegram',
        name: 'Telegram Bot',
        botToken: '123456:test-token'
      }
    })
  })

  it('closes the editor and opens pairings immediately after saving a telegram claw', async () => {
    const pendingRefresh = new Promise<never>(() => undefined)

    vi.mocked(listClaws)
      .mockResolvedValueOnce({
        claws: [],
        availableChannels: []
      })
      .mockImplementationOnce(async () => pendingRefresh)
    vi.mocked(createClaw).mockResolvedValue({
      id: 'assistant-telegram',
      name: 'Telegram Assistant',
      description: '',
      instructions: '',
      providerId: 'provider-1',
      enabled: true,
      channel: {
        id: 'channel-telegram',
        type: 'telegram',
        name: 'Telegram Bot',
        status: 'connected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 1
      }
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Your First Claw')
    )

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="claw-name"]') as HTMLInputElement
    const providerSelect = body.querySelector('select[id="claw-provider"]') as HTMLSelectElement
    const channelTypeSelect = body.querySelector(
      'select[id="claw-channel-type"]'
    ) as HTMLSelectElement
    const channelNameInput = body.querySelector('input[id="claw-channel-name"]') as HTMLInputElement
    const saveButton = Array.from(body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Claw')
    )

    await act(async () => {
      setElementValue(nameInput, 'Telegram Assistant')
      setElementValue(providerSelect, 'provider-1')
      setElementValue(channelTypeSelect, 'telegram')
      setElementValue(channelNameInput, 'Telegram Bot')
    })
    await flushAsyncWork()

    const botTokenInput = body.querySelector(
      'input[id="claw-channel-bot-token"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(botTokenInput, '123456:test-token')
    })

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(listClawPairings).toHaveBeenCalledWith('assistant-telegram')
    expect(document.body.textContent).toContain('Manage Pairings')
    expect(document.body.querySelector('input[id="claw-name"]')).toBeNull()
  })

  it('opens telegram pairings and approves a pending request', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-telegram',
          name: 'Telegram Assistant',
          description: '',
          instructions: '',
          providerId: 'provider-1',
          enabled: true,
          channel: {
            id: 'channel-telegram',
            type: 'telegram',
            name: 'Telegram Bot',
            status: 'connected',
            errorMessage: null,
            pairedCount: 1,
            pendingPairingCount: 1
          }
        }
      ],
      availableChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Telegram Assistant')
    expect(container.textContent).toContain('1 paired')
    expect(container.textContent).toContain('1 pending')

    const managePairingsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Manage Pairings')
    )

    await act(async () => {
      managePairingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(listClawPairings).toHaveBeenCalledWith('assistant-telegram')
    expect(document.body.textContent).toContain('AB7KQ2XM')

    const approveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Approve')
    )

    await act(async () => {
      approveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(approveClawPairing).toHaveBeenCalledWith('assistant-telegram', 'pairing-pending')
  })
})

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAssistant,
  listAssistants,
  updateAssistant as updateAssistantRecord
} from '../../assistants/assistants-query'
import { updateAssistantHeartbeat } from '../../assistants/assistant-heartbeat-query'
import { listProviders } from '../../settings/providers/providers-query'
import { getMcpServersSettings } from '../../settings/mcp-servers/mcp-servers-query'
import { ClawsPage } from './claws-page'
import {
  approveClawPairing,
  createClawChannel,
  deleteClaw,
  deleteClawChannel,
  getClawChannelAuthState,
  listClawPairings,
  listClaws,
  rejectClawPairing,
  revokeClawPairing,
  updateClaw
} from '../claws-query'

vi.mock('../../settings/providers/providers-query', () => ({
  listProviders: vi.fn()
}))

vi.mock('../../settings/mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: vi.fn()
}))

vi.mock('../../assistants/assistants-query', () => ({
  assistantKeys: {
    lists: () => ['assistants', 'list']
  },
  listAssistants: vi.fn(),
  createAssistant: vi.fn(),
  updateAssistant: vi.fn()
}))

vi.mock('../../assistants/assistant-heartbeat-query', () => ({
  DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES: 30,
  DEFAULT_ASSISTANT_HEARTBEAT_PROMPT:
    'Review recent work logs and recent conversations. Follow up only if needed.',
  getAssistantHeartbeat: vi.fn(),
  updateAssistantHeartbeat: vi.fn()
}))

vi.mock('../claws-query', () => ({
  listClaws: vi.fn(),
  createClawChannel: vi.fn(),
  updateClaw: vi.fn(),
  deleteClaw: vi.fn(),
  deleteClawChannel: vi.fn(),
  listClawPairings: vi.fn(),
  getClawChannelAuthState: vi.fn(),
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
  const prototype = Object.getPrototypeOf(element) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  if (setter) {
    setter.call(element, value)
  } else {
    element.value = value
  }
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
  )
}

function findButtonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text)
  ) as HTMLButtonElement | undefined
}

async function clickElement(element: Element | null | undefined): Promise<void> {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function openMenu(element: Element | null | undefined): Promise<void> {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function findClawCard(clawName: string): HTMLElement | null {
  const title = Array.from(document.body.querySelectorAll('[data-slot="card-title"]')).find(
    (element) => element.textContent?.includes(clawName)
  )

  return (title?.closest('[data-slot="card"]') as HTMLElement | null) ?? null
}

async function openClawActions(clawName: string): Promise<void> {
  const card = findClawCard(clawName)
  const actionsButton = card ? findButtonByText(card, 'Actions') : undefined

  await openMenu(actionsButton)
  await flushAsyncWork()
}

function findMenuItemByText(text: string): HTMLElement | undefined {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((element) =>
    element.textContent?.includes(text)
  ) as HTMLElement | undefined
}

async function chooseProvider(providerName: string): Promise<void> {
  const openSelectorButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Select provider')
  ) as HTMLButtonElement | undefined

  await clickElement(openSelectorButton)
  await flushAsyncWork()

  const providerButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(providerName)
  ) as HTMLButtonElement | undefined

  await clickElement(providerButton)
  await flushAsyncWork()
}

describe('ClawsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.resetAllMocks()
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
    vi.mocked(getMcpServersSettings).mockResolvedValue({
      mcpServers: {}
    })
    vi.mocked(listAssistants).mockResolvedValue([
      {
        id: 'assistant-1',
        name: 'Ops Assistant',
        description: '',
        instructions: '',
        enabled: true,
        providerId: 'provider-1',
        workspaceConfig: {},
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-08T00:00:00.000Z',
        updatedAt: '2026-03-08T00:00:00.000Z'
      }
    ])
    vi.mocked(createAssistant).mockResolvedValue({
      id: 'assistant-1',
      name: 'Ops Assistant',
      description: '',
      instructions: '',
      enabled: true,
      providerId: 'provider-1',
      workspaceConfig: {},
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z'
    })
    vi.mocked(createClawChannel).mockResolvedValue({
      id: 'channel-created',
      type: 'lark',
      name: 'Created Lark',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null,
      pairedCount: 0,
      pendingPairingCount: 0
    })
    vi.mocked(updateAssistantRecord).mockResolvedValue({
      id: 'assistant-1',
      name: 'Ops Assistant',
      description: '',
      instructions: '',
      enabled: true,
      providerId: 'provider-1',
      workspaceConfig: {},
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z'
    })
    vi.mocked(updateAssistantHeartbeat).mockResolvedValue({
      id: 'heartbeat-1',
      assistantId: 'assistant-1',
      enabled: false,
      intervalMinutes: 30,
      prompt: 'Review recent work logs and recent conversations. Follow up only if needed.',
      threadId: null,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      lastError: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z'
    })
    vi.mocked(updateClaw).mockResolvedValue({
      id: 'assistant-1',
      name: 'Ops Assistant',
      description: '',
      providerId: 'provider-1',
      workspacePath: null,
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
    vi.mocked(deleteClawChannel).mockResolvedValue(undefined)
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
    vi.mocked(getClawChannelAuthState).mockResolvedValue({
      channelId: 'channel-whatsapp',
      channelType: 'whatsapp',
      status: 'qr_ready',
      qrCodeDataUrl: 'data:image/png;base64,qr',
      qrCodeValue: 'qr-value',
      phoneNumber: null,
      errorMessage: null,
      updatedAt: '2026-03-10T00:00:00.000Z'
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

  it('renders assistant management onboarding when no assistants are connected yet', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [],
      configuredChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Assistants & Channels')
    expect(container.textContent).toContain('Create your first assistant')
    expect(container.textContent).toContain('Create Assistant')
  })

  it('renders existing claw cards', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-1',
          name: 'Ops Assistant',
          description: '',
          providerId: 'provider-1',
          workspacePath: null,
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
      configuredChannels: []
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
    expect(container.textContent).toContain('New Assistant')
    expect(findButtonByText(findClawCard('Ops Assistant') ?? container, 'Actions')).toBeDefined()
  })

  it('shows a warning and disables enable when a claw has no channel', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-1',
          name: 'Ops Assistant',
          description: '',
          providerId: 'provider-1',
          workspacePath: null,
          enabled: false,
          channel: null
        }
      ],
      configuredChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).not.toContain('Create your first assistant')
    expect(container.textContent).toContain('Configure a channel first')

    await openClawActions('Ops Assistant')

    const enableItem = findMenuItemByText('Enable')
    const isDisabled =
      enableItem?.hasAttribute('data-disabled') === true ||
      enableItem?.getAttribute('aria-disabled') === 'true'

    expect(isDisabled).toBe(true)
  })

  it('creates a claw from the onboarding dialog', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [],
      configuredChannels: []
    })
    vi.mocked(listAssistants).mockResolvedValue([])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const createButton = findButtonByText(container, 'Create Assistant')

    await clickElement(createButton)
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="assistant-name"]') as HTMLInputElement
    await act(async () => {
      setElementValue(nameInput, 'Ops Assistant')
    })
    await chooseProvider('OpenAI')

    await clickElement(findButtonByText(body, 'Channels'))
    await flushAsyncWork()

    const addChannelButton = body.querySelector('button[id="claw-channel-selector-add"]') as
      | HTMLButtonElement
      | null

    await clickElement(addChannelButton)
    await flushAsyncWork()

    const channelNameInput = body.querySelector(
      'input[id="claw-channel-create-name"]'
    ) as HTMLInputElement
    const appIdInput = body.querySelector(
      'input[id="claw-channel-create-app-id"]'
    ) as HTMLInputElement
    const appSecretInput = body.querySelector(
      'input[id="claw-channel-create-app-secret"]'
    ) as HTMLInputElement
    const createChannelButton = body.querySelector(
      'button[id="claw-channel-create-save"]'
    ) as HTMLButtonElement

    await act(async () => {
      setElementValue(channelNameInput, 'Ops Lark')
      setElementValue(appIdInput, 'cli_ops')
      setElementValue(appSecretInput, 'secret-ops')
    })

    vi.mocked(createClawChannel).mockResolvedValueOnce({
      id: 'channel-created',
      type: 'lark',
      name: 'Ops Lark',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null,
      pairedCount: 0,
      pendingPairingCount: 0
    })

    await clickElement(createChannelButton)
    await flushAsyncWork()
    await clickElement(findButtonByText(body, 'Essential Settings'))
    await flushAsyncWork()

    const saveButton = body.querySelector('button[id="claw-create-submit"]') as HTMLButtonElement

    await clickElement(saveButton)
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'lark',
      name: 'Ops Lark',
      appId: 'cli_ops',
      appSecret: 'secret-ops',
      groupRequireMention: true
    })
    expect(createAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ops Assistant',
        providerId: 'provider-1'
      })
    )
    expect(updateClaw).toHaveBeenCalledWith('assistant-1', {
      assistant: {
        enabled: true
      },
      channel: {
        mode: 'attach',
        channelId: 'channel-created'
      }
    })
  })

  it('creates a telegram claw from the onboarding dialog', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [],
      configuredChannels: []
    })
    vi.mocked(listAssistants).mockResolvedValue([])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const createButton = findButtonByText(container, 'Create Assistant')

    await clickElement(createButton)
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="assistant-name"]') as HTMLInputElement
    await act(async () => {
      setElementValue(nameInput, 'Telegram Assistant')
    })
    await chooseProvider('OpenAI')
    await clickElement(findButtonByText(body, 'Channels'))
    await flushAsyncWork()

    const addChannelButton = body.querySelector(
      'button[id="claw-channel-selector-add"]'
    ) as HTMLButtonElement

    await clickElement(addChannelButton)
    await flushAsyncWork()

    const channelTypeSelect = body.querySelector(
      'select[id="claw-channel-create-type"]'
    ) as HTMLSelectElement

    await act(async () => {
      setElementValue(channelTypeSelect, 'telegram')
    })
    await flushAsyncWork()

    const channelNameInput = body.querySelector(
      'input[id="claw-channel-create-name"]'
    ) as HTMLInputElement
    const botTokenInput = body.querySelector(
      'input[id="claw-channel-create-bot-token"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(channelNameInput, 'Telegram Bot')
      setElementValue(botTokenInput, '123456:test-token')
    })

    vi.mocked(createClawChannel).mockResolvedValueOnce({
      id: 'channel-telegram-new',
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null,
      pairedCount: 0,
      pendingPairingCount: 0
    })

    const createChannelButton = body.querySelector(
      'button[id="claw-channel-create-save"]'
    ) as HTMLButtonElement

    await clickElement(createChannelButton)
    await flushAsyncWork()
    await clickElement(findButtonByText(body, 'Essential Settings'))
    await flushAsyncWork()

    const saveButton = body.querySelector('button[id="claw-create-submit"]') as HTMLButtonElement

    await clickElement(saveButton)
    await flushAsyncWork()

    expect(createClawChannel).toHaveBeenCalledWith({
      type: 'telegram',
      name: 'Telegram Bot',
      botToken: '123456:test-token'
    })
    expect(createAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Telegram Assistant',
        providerId: 'provider-1'
      })
    )
    expect(updateClaw).toHaveBeenCalledWith('assistant-1', {
      assistant: {
        enabled: true
      },
      channel: {
        mode: 'attach',
        channelId: 'channel-telegram-new'
      }
    })
  })

  it('closes the editor and opens pairings immediately after saving a telegram claw', async () => {
    vi.mocked(listClaws)
      .mockResolvedValueOnce({
        claws: [],
        configuredChannels: []
      })
      .mockResolvedValueOnce({
        claws: [
          {
            id: 'assistant-telegram',
            name: 'Telegram Assistant',
            description: '',
            providerId: 'provider-1',
            workspacePath: null,
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
          }
        ],
        configuredChannels: []
      })
    vi.mocked(createAssistant).mockResolvedValue({
      id: 'assistant-telegram',
      name: 'Telegram Assistant',
      description: '',
      instructions: '',
      enabled: true,
      providerId: 'provider-1',
      workspaceConfig: {},
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z'
    })
    vi.mocked(listAssistants).mockResolvedValue([])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const createButton = findButtonByText(container, 'Create Assistant')

    await clickElement(createButton)
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="assistant-name"]') as HTMLInputElement
    await act(async () => {
      setElementValue(nameInput, 'Telegram Assistant')
    })
    await chooseProvider('OpenAI')
    await clickElement(findButtonByText(body, 'Channels'))
    await flushAsyncWork()

    const addChannelButton = body.querySelector(
      'button[id="claw-channel-selector-add"]'
    ) as HTMLButtonElement

    await clickElement(addChannelButton)
    await flushAsyncWork()

    const channelTypeSelect = body.querySelector(
      'select[id="claw-channel-create-type"]'
    ) as HTMLSelectElement

    await act(async () => {
      setElementValue(channelTypeSelect, 'telegram')
    })
    await flushAsyncWork()

    const channelNameInput = body.querySelector(
      'input[id="claw-channel-create-name"]'
    ) as HTMLInputElement
    const botTokenInput = body.querySelector(
      'input[id="claw-channel-create-bot-token"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(channelNameInput, 'Telegram Bot')
      setElementValue(botTokenInput, '123456:test-token')
    })

    vi.mocked(createClawChannel).mockResolvedValueOnce({
      id: 'channel-telegram-new',
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null,
      pairedCount: 0,
      pendingPairingCount: 0
    })

    const createChannelButton = body.querySelector(
      'button[id="claw-channel-create-save"]'
    ) as HTMLButtonElement

    await clickElement(createChannelButton)
    await flushAsyncWork()
    await clickElement(findButtonByText(body, 'Essential Settings'))
    await flushAsyncWork()

    const saveButton = body.querySelector('button[id="claw-create-submit"]') as HTMLButtonElement

    await clickElement(saveButton)
    await flushAsyncWork()

    expect(listClawPairings).toHaveBeenCalledWith('assistant-telegram')
    expect(document.body.textContent).toContain('Manage Pairings')
    expect(document.body.querySelector('input[id="assistant-name"]')).toBeNull()
  })

  it('opens whatsapp auth state and pairings immediately after saving a whatsapp claw', async () => {
    vi.mocked(listClaws)
      .mockResolvedValueOnce({
        claws: [],
        configuredChannels: []
      })
      .mockResolvedValueOnce({
        claws: [
          {
            id: 'assistant-whatsapp',
            name: 'WhatsApp Assistant',
            description: '',
            providerId: 'provider-1',
            workspacePath: null,
            enabled: true,
            channel: {
              id: 'channel-whatsapp',
              type: 'whatsapp',
              name: 'WhatsApp Device',
              status: 'disconnected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          }
        ],
        configuredChannels: []
      })
    vi.mocked(createAssistant).mockResolvedValue({
      id: 'assistant-whatsapp',
      name: 'WhatsApp Assistant',
      description: '',
      instructions: '',
      enabled: true,
      providerId: 'provider-1',
      workspaceConfig: {},
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 100,
      memoryConfig: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z'
    })
    vi.mocked(listAssistants).mockResolvedValue([])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const newButton = findButtonByText(container, 'New Assistant')

    await clickElement(newButton)
    await flushAsyncWork()

    const body = document.body
    const nameInput = body.querySelector('input[id="assistant-name"]') as HTMLInputElement
    await act(async () => {
      setElementValue(nameInput, 'WhatsApp Assistant')
    })
    await chooseProvider('OpenAI')
    await clickElement(findButtonByText(body, 'Channels'))
    await flushAsyncWork()

    const addChannelButton = body.querySelector(
      'button[id="claw-channel-selector-add"]'
    ) as HTMLButtonElement

    await clickElement(addChannelButton)
    await flushAsyncWork()

    const channelTypeSelect = body.querySelector(
      'select[id="claw-channel-create-type"]'
    ) as HTMLSelectElement

    await act(async () => {
      setElementValue(channelTypeSelect, 'whatsapp')
    })
    await flushAsyncWork()

    const channelNameInput = body.querySelector(
      'input[id="claw-channel-create-name"]'
    ) as HTMLInputElement

    await act(async () => {
      setElementValue(channelNameInput, 'WhatsApp Device')
    })

    vi.mocked(createClawChannel).mockResolvedValueOnce({
      id: 'channel-whatsapp-new',
      type: 'whatsapp',
      name: 'WhatsApp Device',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null,
      pairedCount: 0,
      pendingPairingCount: 0
    })

    const createChannelButton = body.querySelector(
      'button[id="claw-channel-create-save"]'
    ) as HTMLButtonElement

    await clickElement(createChannelButton)
    await flushAsyncWork()
    await clickElement(findButtonByText(body, 'Essential Settings'))
    await flushAsyncWork()

    const saveButton = body.querySelector('button[id="claw-create-submit"]') as HTMLButtonElement

    await clickElement(saveButton)
    await flushAsyncWork()

    expect(listClawPairings).toHaveBeenCalledWith('assistant-whatsapp')
    expect(getClawChannelAuthState).toHaveBeenCalledWith('assistant-whatsapp')
    expect(document.body.querySelector('img')).not.toBeNull()
    expect(document.body.querySelector('input[id="assistant-name"]')).toBeNull()
  })

  it('opens telegram pairings and approves a pending request', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-telegram',
          name: 'Telegram Assistant',
          description: '',
          providerId: 'provider-1',
          workspacePath: null,
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
      configuredChannels: []
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

  it('opens whatsapp access dialog and shows qr state', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-whatsapp',
          name: 'WhatsApp Assistant',
          description: '',
          providerId: 'provider-1',
          workspacePath: null,
          enabled: true,
          channel: {
            id: 'channel-whatsapp',
            type: 'whatsapp',
            name: 'WhatsApp Device',
            status: 'disconnected',
            errorMessage: null,
            pairedCount: 0,
            pendingPairingCount: 1
          }
        }
      ],
      configuredChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const managePairingsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Manage Pairings')
    )

    await act(async () => {
      managePairingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(listClawPairings).toHaveBeenCalledWith('assistant-whatsapp')
    expect(getClawChannelAuthState).toHaveBeenCalledWith('assistant-whatsapp')
    expect(document.body.textContent).toContain('WhatsApp Login')
    expect(document.body.querySelector('img')).not.toBeNull()
  })

  it('offers cancel, disable, and confirm delete when removing a claw', async () => {
    vi.mocked(listClaws).mockResolvedValue({
      claws: [
        {
          id: 'assistant-1',
          name: 'Ops Assistant',
          description: '',
          providerId: 'provider-1',
          workspacePath: null,
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
      configuredChannels: []
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClawsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    await openClawActions('Ops Assistant')

    const deleteButton = findMenuItemByText('Delete')

    await clickElement(deleteButton)
    await flushAsyncWork()

    expect(document.body.textContent).toContain('Delete "Ops Assistant"?')
    expect(document.body.textContent).toContain('This will also delete all assistant history.')

    const cancelButton = document.body.querySelector(
      'button[id="claw-delete-dialog-cancel"]'
    ) as HTMLButtonElement

    await clickElement(cancelButton)
    await flushAsyncWork()

    expect(deleteClaw).not.toHaveBeenCalled()
    expect(updateClaw).not.toHaveBeenCalled()

    await openClawActions('Ops Assistant')
    await clickElement(findMenuItemByText('Delete'))
    await flushAsyncWork()

    const disableButton = document.body.querySelector(
      'button[id="claw-delete-dialog-disable"]'
    ) as HTMLButtonElement

    await clickElement(disableButton)
    await flushAsyncWork()

    expect(updateClaw).toHaveBeenCalledWith('assistant-1', {
      assistant: {
        enabled: false
      }
    })
    expect(deleteClaw).not.toHaveBeenCalled()

    await openClawActions('Ops Assistant')
    await clickElement(findMenuItemByText('Delete'))
    await flushAsyncWork()

    const confirmDeleteButton = document.body.querySelector(
      'button[id="claw-delete-dialog-confirm"]'
    ) as HTMLButtonElement

    await clickElement(confirmDeleteButton)
    await flushAsyncWork()

    expect(deleteClaw).toHaveBeenCalledWith('assistant-1')
  }, 15000)
})

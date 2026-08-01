// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpServersSettingsPage } from './mcp-servers-settings-page'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getHealth: vi.fn(),
  getAuth: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  settled: null as null | (() => void)
}))

vi.mock('../providers/providers-query', () => ({
  useProviders: () => ({
    data: [
      {
        id: 'provider-1',
        type: 'openai',
        selectedModel: 'gpt-5',
        enabled: true,
        isDefault: true
      }
    ],
    isLoading: false
  })
}))

vi.mock('../../threads/components/transient-pi-thread', () => ({
  TransientPiThread: ({ onSessionSettled }: { onSessionSettled?: () => void }) => {
    mocks.settled = onSessionSettled ?? null
    return <button aria-label="Add MCP">Add MCP</button>
  }
}))

vi.mock('../mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: mocks.getSettings,
  getMcpServersHealth: mocks.getHealth,
  getMcpServersAuth: mocks.getAuth,
  loginToMcpServer: mocks.login,
  logoutFromMcpServer: mocks.logout
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('MCP servers settings', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.getSettings.mockResolvedValue({
      mcpServers: {
        linear: {
          isActive: true,
          name: 'Linear',
          type: 'http',
          args: [],
          env: {},
          installSource: 'direct',
          url: 'https://mcp.linear.app/mcp'
        }
      }
    })
    mocks.getHealth.mockResolvedValue({})
    mocks.getAuth.mockResolvedValue({ linear: 'not-signed-in' })
    mocks.login.mockResolvedValue('signed-in')
    mocks.logout.mockResolvedValue('not-signed-in')
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('starts OAuth directly from the saved server row', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage embedded />
        </MemoryRouter>
      )
    })
    await flush()

    const signIn = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Sign in'
    )
    expect(signIn).toBeDefined()

    await act(async () => signIn?.click())
    await flush()

    expect(mocks.login).toHaveBeenCalledWith('linear')
  })

  it('keeps saved servers visible during a background refresh after an assistant turn', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage embedded />
        </MemoryRouter>
      )
    })
    await flush()

    expect(container.textContent).toContain('Linear')
    let resolveSettings: ((value: unknown) => void) | undefined
    mocks.getSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve
        })
    )

    act(() => mocks.settled?.())
    await flush()

    expect(container.textContent).toContain('Linear')
    expect(container.textContent).not.toContain('Loading MCP')

    await act(async () => {
      resolveSettings?.({
        mcpServers: {
          linear: {
            isActive: true,
            name: 'Linear',
            type: 'http',
            args: [],
            env: {},
            installSource: 'direct',
            url: 'https://mcp.linear.app/mcp'
          }
        }
      })
    })
  })
})

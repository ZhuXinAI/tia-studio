// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadInteractionCard } from './thread-interaction-card'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  respond: vi.fn()
}))

vi.mock('../../settings/mcp-servers/mcp-servers-query', () => ({
  loginToMcpServer: mocks.login
}))

vi.mock('../agent-sessions-query', () => ({
  respondToAgentInteraction: mocks.respond
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('ThreadInteractionCard MCP OAuth approval', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.login.mockResolvedValue('signed-in')
    mocks.respond.mockResolvedValue(undefined)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('opens OAuth before resuming the agent after Allow once', async () => {
    await act(async () => {
      root.render(
        <ThreadInteractionCard
          sessionId="setup-session"
          request={{
            id: 'oauth-confirmation',
            method: 'confirm',
            title: 'Sign in to Linear?',
            message: 'TIA will open the browser OAuth flow.',
            action: { type: 'mcp-oauth', serverId: 'linear' }
          }}
        />
      )
    })

    const allow = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Allow once'
    )
    await act(async () => allow?.click())

    expect(mocks.login).toHaveBeenCalledWith('linear')
    expect(mocks.respond).toHaveBeenCalledWith('setup-session', {
      id: 'oauth-confirmation',
      confirmed: true
    })
    expect(mocks.login.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.respond.mock.invocationCallOrder[0]
    )
  })
})

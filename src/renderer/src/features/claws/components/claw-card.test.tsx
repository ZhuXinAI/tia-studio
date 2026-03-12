// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClawCard } from './claw-card'

describe('ClawCard', () => {
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

  it('keeps the enabled badge alongside short names instead of stretching the title row', async () => {
    await act(async () => {
      root.render(
        <ClawCard
          claw={{
            id: 'claw-1',
            name: 'GMNT',
            description: '',
            providerId: 'provider-1',
            workspacePath: null,
            enabled: true,
            channel: {
              id: 'channel-1',
              type: 'lark',
              name: 'Lark T',
              status: 'connected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          }}
          providerLabel="GMN"
          isSubmitting={false}
          onToggleEnabled={() => undefined}
          onEdit={() => undefined}
          onDelete={() => undefined}
          onViewHeartbeat={() => undefined}
          onViewCron={() => undefined}
        />
      )
    })

    const title = document.body.querySelector('[data-slot="card-title"]')

    expect(title).not.toBeNull()
    expect(title?.className).toContain('min-w-0')
    expect(title?.className).toContain('truncate')
    expect(title?.className).not.toContain('flex-1')
    expect(title?.nextElementSibling?.textContent).toContain('Enabled')
  })
})

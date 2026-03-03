// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpServersSettingsPage } from './mcp-servers-settings-page'
import {
  getMcpServersSettings,
  updateMcpServersSettings
} from '../mcp-servers/mcp-servers-query'

vi.mock('../mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: vi.fn(),
  updateMcpServersSettings: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('mcp servers settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(getMcpServersSettings).mockResolvedValue({
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'demo-key'
          },
          installSource: 'unknown'
        }
      }
    })

    vi.mocked(updateMcpServersSettings).mockResolvedValue({
      mcpServers: {
        'amap-maps': {
          isActive: false,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'demo-key'
          },
          installSource: 'unknown'
        }
      }
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('toggles global activation and saves mcp settings', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const toggleSwitch = container.querySelector(
      '[aria-label="Toggle amap-maps"]'
    ) as HTMLButtonElement | null
    expect(toggleSwitch).not.toBeNull()

    await act(async () => {
      toggleSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save')
    )
    expect(saveButton).not.toBeUndefined()

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateMcpServersSettings).toHaveBeenCalledWith({
      mcpServers: {
        'amap-maps': {
          isActive: false,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'demo-key'
          },
          installSource: 'unknown'
        }
      }
    })
    expect(container.textContent).toContain('MCP server settings saved.')
  })
})

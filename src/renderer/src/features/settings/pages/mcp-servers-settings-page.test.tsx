// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpServersSettingsPage } from './mcp-servers-settings-page'
import { getMcpServersSettings, updateMcpServersSettings } from '../mcp-servers/mcp-servers-query'

vi.mock('../mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: vi.fn(),
  updateMcpServersSettings: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  valueSetter?.call(textarea, value)
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
    // Toast is rendered by Sonner in a portal, not in the component tree
  })

  it('shows runtime setup guidance for managed-runtime commands', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('managed runtimes')
    expect(container.textContent).toContain('Finish bun setup in')
    expect(container.textContent).toContain('ACP / Runtimes')
  })

  it('allows partial environment variable edits and persists them', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const envTextarea = container.querySelector('#mcp-env-amap-maps') as HTMLTextAreaElement | null
    expect(envTextarea).not.toBeNull()

    await act(async () => {
      if (!envTextarea) {
        return
      }

      setTextareaValue(envTextarea, 'AMAP_MAPS_API_KEY=demo-key\nNEW_TOKEN')
      envTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(envTextarea?.value).toBe('AMAP_MAPS_API_KEY=demo-key\nNEW_TOKEN')

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save')
    )

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateMcpServersSettings).toHaveBeenCalledWith({
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'demo-key',
            NEW_TOKEN: ''
          },
          installSource: 'unknown'
        }
      }
    })
  })

  it('supports editing settings in raw json', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const editJsonButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Edit JSON')
    )
    expect(editJsonButton).not.toBeUndefined()

    await act(async () => {
      editJsonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const rawJsonTextarea = container.querySelector(
      '#mcp-json-dialog-textarea'
    ) as HTMLTextAreaElement | null
    expect(rawJsonTextarea).not.toBeNull()

    await act(async () => {
      if (!rawJsonTextarea) {
        return
      }

      setTextareaValue(
        rawJsonTextarea,
        JSON.stringify(
          {
            mcpServers: {
              'amap-maps': {
                isActive: false,
                name: 'amap-maps',
                type: 'stdio',
                command: 'npx',
                args: ['-y', '@amap/amap-maps-mcp-server'],
                env: {
                  AMAP_MAPS_API_KEY: 'next-key'
                },
                installSource: 'manual'
              }
            }
          },
          null,
          2
        )
      )
      rawJsonTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const applyJsonButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apply JSON')
    )

    await act(async () => {
      applyJsonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save')
    )

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
            AMAP_MAPS_API_KEY: 'next-key'
          },
          installSource: 'manual'
        }
      }
    })
  })

  it('keeps free-form newlines while editing json dialog text', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const editJsonButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Edit JSON')
    )

    await act(async () => {
      editJsonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const rawJsonTextarea = container.querySelector(
      '#mcp-json-dialog-textarea'
    ) as HTMLTextAreaElement | null
    expect(rawJsonTextarea).not.toBeNull()

    await act(async () => {
      if (!rawJsonTextarea) {
        return
      }

      setTextareaValue(rawJsonTextarea, `${rawJsonTextarea.value}\n`)
      rawJsonTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(rawJsonTextarea?.value.endsWith('\n')).toBe(true)
  })

  it('shows validation error and does not apply invalid json dialog input', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const editJsonButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Edit JSON')
    )

    await act(async () => {
      editJsonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const rawJsonTextarea = container.querySelector(
      '#mcp-json-dialog-textarea'
    ) as HTMLTextAreaElement | null
    expect(rawJsonTextarea).not.toBeNull()

    await act(async () => {
      if (!rawJsonTextarea) {
        return
      }

      setTextareaValue(rawJsonTextarea, '{')
      rawJsonTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const applyJsonButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apply JSON')
    )

    await act(async () => {
      applyJsonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Raw JSON is invalid.')
    expect(container.querySelector('#mcp-json-dialog-textarea')).not.toBeNull()
    expect(updateMcpServersSettings).toHaveBeenCalledTimes(0)
  })

  it('does not render install guidance section', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <McpServersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).not.toContain('Install Guidance')
  })
})

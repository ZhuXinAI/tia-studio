// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeSetupPage } from './runtime-setup-page'
import { getManagedRuntimeStatus } from '../runtimes/managed-runtimes-query'

vi.mock('../runtimes/managed-runtimes-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtimes/managed-runtimes-query')>()

  return {
    ...actual,
    getManagedRuntimeStatus: vi.fn(),
    checkManagedRuntimeLatest: vi.fn(),
    installManagedRuntime: vi.fn(),
    pickCustomRuntime: vi.fn(),
    clearManagedRuntime: vi.fn()
  }
})

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('runtime setup page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(getManagedRuntimeStatus).mockResolvedValue({
      bun: {
        source: 'managed',
        binaryPath: '/managed/bun/bin/bun',
        version: 'bun 1.2.0',
        installedAt: '2026-03-08T00:00:00.000Z',
        lastCheckedAt: '2026-03-08T01:00:00.000Z',
        releaseUrl: 'https://example.test/bun',
        checksum: null,
        status: 'ready',
        errorMessage: null
      },
      uv: {
        source: 'none',
        binaryPath: null,
        version: null,
        installedAt: null,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'missing',
        errorMessage: null
      },
      'agent-browser': {
        source: 'none',
        binaryPath: null,
        version: null,
        installedAt: null,
        lastCheckedAt: null,
        releaseUrl: null,
        checksum: null,
        status: 'missing',
        errorMessage: null
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

  it('renders bun, uv, and agent-browser runtime cards with actions', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RuntimeSetupPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Runtime Setup')
    expect(container.textContent).toContain('bun')
    expect(container.textContent).toContain('uv')
    expect(container.textContent).toContain('agent-browser')
    expect(container.textContent).toContain('ready')
    expect(container.textContent).toContain('missing')
    expect(container.textContent).toContain('Install latest')
    expect(container.textContent).toContain('Use downloaded binary')
    expect(container.textContent).toContain('Check again')
  })
})

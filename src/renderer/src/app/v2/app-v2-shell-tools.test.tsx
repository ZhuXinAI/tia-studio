// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadWorkspaceTools } from './app-v2-shell-tools'
import { AppV2ShellBottomDrawerContext } from './app-v2-shell-bottom-drawer'
import { AppV2ShellRightRailContext } from './app-v2-shell-right-rail'

vi.mock('../../features/artifacts/artifacts-query', () => ({
  useAgentArtifacts: () => ({ data: [{ id: 'artifact-1' }] })
}))
vi.mock('../../features/artifacts/components/artifact-rail', () => ({
  ArtifactRail: () => <div data-testid="artifacts-content">Artifacts content</div>
}))
vi.mock('../../features/browser/components/browser-rail', () => ({
  BrowserRail: () => <div data-testid="browser-content">Browser content</div>
}))
vi.mock('../../features/files/components/files-rail', () => ({
  FilesRail: () => <div data-testid="files-content">Files content</div>
}))
vi.mock('../../features/terminal/components/terminal-rail', () => ({
  TerminalRail: () => <div data-testid="terminal-content">Terminal content</div>
}))

describe('ThreadWorkspaceTools', () => {
  let container: HTMLDivElement
  let root: Root
  let rightSlot: HTMLDivElement
  let bottomSlot: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    rightSlot = document.createElement('div')
    bottomSlot = document.createElement('div')
    container.append(rightSlot, bottomSlot)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('starts with the chooser and switches between browser, files, and artifacts tabs', async () => {
    const setRightRailOpen = vi.fn()
    const setBottomDrawerOpen = vi.fn()

    await act(async () => {
      root.render(
        <AppV2ShellRightRailContext.Provider
          value={{
            isOpen: true,
            setIsOpen: setRightRailOpen,
            toggle: vi.fn(),
            setHasContent: vi.fn(),
            slotElement: rightSlot
          }}
        >
          <AppV2ShellBottomDrawerContext.Provider
            value={{
              isOpen: false,
              setIsOpen: setBottomDrawerOpen,
              toggle: vi.fn(),
              setHasContent: vi.fn(),
              slotElement: bottomSlot
            }}
          >
            <ThreadWorkspaceTools sessionId="session-1" />
          </AppV2ShellBottomDrawerContext.Provider>
        </AppV2ShellRightRailContext.Provider>
      )
    })

    expect(rightSlot.querySelector('[data-testid="tools-empty-state"]')).not.toBeNull()
    expect(rightSlot.textContent).toContain('Browser')
    expect(rightSlot.textContent).toContain('Files')
    expect(rightSlot.textContent).toContain('Artifacts')

    await act(async () => {
      rightSlot
        .querySelector<HTMLButtonElement>('button[aria-label="Open browser"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rightSlot.querySelector('[data-testid="tools-panel"]')).not.toBeNull()
    expect(rightSlot.querySelector('[data-testid="browser-content"]')).not.toBeNull()

    await act(async () => {
      rightSlot
        .querySelector<HTMLButtonElement>('button[role="tab"][aria-label="Files"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect(rightSlot.querySelector('[data-testid="files-content"]')).not.toBeNull()

    await act(async () => {
      rightSlot
        .querySelector<HTMLButtonElement>('button[role="tab"][aria-label="Artifacts"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rightSlot.querySelector('[data-testid="artifacts-content"]')).not.toBeNull()
    expect(setRightRailOpen).toHaveBeenCalledWith(true)
    expect(setBottomDrawerOpen).not.toHaveBeenCalled()
  })

  it('organizes the bottom drawer as terminal and browser tabs', async () => {
    await act(async () => {
      root.render(
        <AppV2ShellRightRailContext.Provider
          value={{
            isOpen: false,
            setIsOpen: vi.fn(),
            toggle: vi.fn(),
            setHasContent: vi.fn(),
            slotElement: rightSlot
          }}
        >
          <AppV2ShellBottomDrawerContext.Provider
            value={{
              isOpen: true,
              setIsOpen: vi.fn(),
              toggle: vi.fn(),
              setHasContent: vi.fn(),
              slotElement: bottomSlot
            }}
          >
            <ThreadWorkspaceTools sessionId="session-1" />
          </AppV2ShellBottomDrawerContext.Provider>
        </AppV2ShellRightRailContext.Provider>
      )
    })

    expect(bottomSlot.querySelector('[data-testid="bottom-tools-panel"]')).not.toBeNull()
    expect(bottomSlot.querySelector('[role="tab"][aria-label="Terminal"]')).not.toBeNull()
    expect(bottomSlot.querySelector('[role="tab"][aria-label="Browser"]')).not.toBeNull()
    expect(bottomSlot.querySelector('[data-testid="terminal-content"]')).not.toBeNull()

    await act(async () => {
      bottomSlot
        .querySelector<HTMLButtonElement>('button[role="tab"][aria-label="Browser"]')
        ?.click()
    })

    expect(bottomSlot.querySelector('[data-testid="browser-content"]')).not.toBeNull()
    expect(bottomSlot.querySelector('[data-testid="terminal-content"]')).toBeNull()
  })

  it('opens the browser panel when the main process requests it for this session', async () => {
    let requestListener: ((request: { sessionId?: string }) => void) | undefined
    Object.defineProperty(window, 'tiaStudio', {
      configurable: true,
      value: {
        browser: {
          onRequestOpen: (listener: (request: { sessionId?: string }) => void) => {
            requestListener = listener
            return () => undefined
          }
        }
      }
    })

    const setRightRailOpen = vi.fn()
    await act(async () => {
      root.render(
        <AppV2ShellRightRailContext.Provider
          value={{
            isOpen: true,
            setIsOpen: setRightRailOpen,
            toggle: vi.fn(),
            setHasContent: vi.fn(),
            slotElement: rightSlot
          }}
        >
          <AppV2ShellBottomDrawerContext.Provider
            value={{
              isOpen: false,
              setIsOpen: vi.fn(),
              toggle: vi.fn(),
              setHasContent: vi.fn(),
              slotElement: bottomSlot
            }}
          >
            <ThreadWorkspaceTools sessionId="session-1" />
          </AppV2ShellBottomDrawerContext.Provider>
        </AppV2ShellRightRailContext.Provider>
      )
    })

    await act(async () => {
      requestListener?.({ sessionId: 'session-1' })
    })
    expect(rightSlot.querySelector('[data-testid="browser-content"]')).not.toBeNull()
    expect(setRightRailOpen).toHaveBeenCalledWith(true)
    delete (window as Window & { tiaStudio?: unknown }).tiaStudio
  })
})

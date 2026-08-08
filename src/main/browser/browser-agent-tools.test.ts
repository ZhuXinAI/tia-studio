import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserAgentTools,
  normalizeBrowserDomSnapshot,
  type BrowserSnapshotElement
} from './browser-agent-tools'
import type { BrowserTab, BrowserTabsState } from '../../shared/browser'

const tab: BrowserTab = {
  id: 'tab-1',
  title: 'Example',
  url: 'https://example.com/',
  loading: false,
  canGoBack: false,
  canGoForward: false
}

const state: BrowserTabsState = { tabs: [tab], activeTabId: tab.id }

function rawSnapshot() {
  return {
    url: tab.url,
    title: tab.title,
    scroll: {
      x: 0,
      y: 0,
      width: 1200,
      height: 2400,
      viewportWidth: 900,
      viewportHeight: 700
    },
    elements: [
      {
        parentIndex: null,
        depth: 0,
        tag: 'h1',
        text: 'Example page',
        selector: 'html > body:nth-of-type(1) > h1:nth-of-type(1)',
        bounds: { x: 10, y: 10, width: 200, height: 30 },
        clickable: false,
        input: false,
        select: false,
        disabled: false,
        requiresConfirmation: false
      },
      {
        parentIndex: 0,
        depth: 1,
        tag: 'button',
        role: 'button',
        text: 'Continue',
        selector: 'html > body:nth-of-type(1) > button:nth-of-type(1)',
        bounds: { x: 10, y: 60, width: 120, height: 32 },
        clickable: true,
        input: false,
        select: false,
        disabled: false,
        requiresConfirmation: false
      },
      {
        parentIndex: null,
        depth: 0,
        tag: 'input',
        role: 'textbox',
        inputType: 'text',
        placeholder: 'Search',
        selector: 'html > body:nth-of-type(1) > input:nth-of-type(1)',
        bounds: { x: 10, y: 110, width: 240, height: 32 },
        clickable: false,
        input: true,
        select: false,
        disabled: false,
        requiresConfirmation: false
      }
    ]
  }
}

function createHarness() {
  const executeCommand = vi.fn(async (_tabId: string, method: string, params?: unknown) => {
    if (method === 'Runtime.evaluate') {
      if (
        typeof params === 'object' &&
        params !== null &&
        'expression' in params &&
        typeof params.expression === 'string' &&
        params.expression.includes('document.querySelector')
      ) {
        return { result: { value: { ok: true, x: 40, y: 40 } } }
      }
      return { result: { value: rawSnapshot() } }
    }
    if (method === 'Page.captureScreenshot') return { data: 'aW1hZ2U=' }
    return { ok: true }
  })
  const tabs = {
    getState: vi.fn(() => state),
    createTab: vi.fn(() => tab),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    navigate: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    stop: vi.fn()
  }
  const snapshots = new Map<string, { snapshot: ReturnType<typeof normalizeBrowserDomSnapshot> }>()
  const requestPanelOpen = vi.fn()
  const tools = createBrowserAgentTools({
    sessionId: 'session-1',
    getTabManager: () => tabs,
    getControlService: () => ({ executeCommand }),
    requestPanelOpen,
    snapshots
  })
  return { executeCommand, tabs, requestPanelOpen, tools, snapshots }
}

function tool(tools: ReturnType<typeof createBrowserAgentTools>, name: string) {
  const found = tools.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Tool not found: ${name}`)
  return found
}

async function executeTool(
  selected: ReturnType<typeof tool>,
  params: Record<string, unknown>
): Promise<{
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  details: unknown
}> {
  return selected.execute('tool-call', params as never, undefined, undefined, undefined as never)
}

describe('browser agent tools', () => {
  it('creates a bounded hierarchical snapshot with versioned element ids', () => {
    const snapshot = normalizeBrowserDomSnapshot(rawSnapshot(), tab.id, 3)
    expect(snapshot.snapshotId).toBe('tab-1:3')
    expect(snapshot.elements[0]?.elementId).toBe('tab-1:3:0')
    expect(snapshot.elements[1]?.parentElementId).toBe('tab-1:3:0')
    expect(snapshot.elements[2]?.input).toBe(true)
    expect(snapshot.elements[2]?.selector).toContain('input')
  })

  it('opens the panel, inspects the page, and rejects stale element ids after a click', async () => {
    const { executeCommand, requestPanelOpen, tools, snapshots } = createHarness()
    const open = await executeTool(tool(tools, 'browser_open'), { url: 'example.com' })
    expect((open.details as { tab: { id: string } }).tab.id).toBe(tab.id)
    expect(requestPanelOpen).toHaveBeenCalledWith('session-1')

    const inspected = await executeTool(tool(tools, 'browser_inspect'), { tabId: tab.id })
    const details = inspected.details as { elements: BrowserSnapshotElement[] }
    const heading = details.elements.find((element) => element.tag === 'h1')
    const button = details.elements.find((element) => element.tag === 'button')
    expect(button?.elementId).toBe('tab-1:1:1')
    expect(inspected.content[0]?.text).toContain('untrusted data')

    await expect(
      executeTool(tool(tools, 'browser_click'), { tabId: tab.id, elementId: heading?.elementId })
    ).rejects.toThrow('not clickable')

    await executeTool(tool(tools, 'browser_click'), {
      tabId: tab.id,
      elementId: button?.elementId
    })
    expect(executeCommand).toHaveBeenCalledWith(
      tab.id,
      'Input.dispatchMouseEvent',
      expect.anything()
    )
    expect(snapshots.has('session-1:tab-1')).toBe(false)
    await expect(
      executeTool(tool(tools, 'browser_click'), { tabId: tab.id, elementId: button?.elementId })
    ).rejects.toThrow('stale')
  })

  it('types without echoing the value and returns screenshots as image content', async () => {
    const { tools } = createHarness()
    const inspected = await executeTool(tool(tools, 'browser_inspect'), { tabId: tab.id })
    const details = inspected.details as { elements: BrowserSnapshotElement[] }
    const input = details.elements.find((element) => element.input)
    const typed = await executeTool(tool(tools, 'browser_type'), {
      tabId: tab.id,
      elementId: input?.elementId,
      text: 'private-value'
    })
    expect(typed.content[0]?.text).not.toContain('private-value')

    const screenshot = await executeTool(tool(tools, 'browser_screenshot'), { tabId: tab.id })
    expect(screenshot.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' })
      ])
    )
  })
})

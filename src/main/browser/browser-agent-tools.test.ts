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
        href: 'https://example.com/hidden-from-default',
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

function axTree(backendOffset = 0, duplicateButtons = false) {
  return {
    nodes: [
      {
        nodeId: 'root',
        role: { value: 'RootWebArea' },
        name: { value: 'Example' },
        childIds: ['heading', 'button', ...(duplicateButtons ? ['button-2'] : []), 'input', 'link']
      },
      {
        nodeId: 'heading',
        role: { value: 'heading' },
        name: { value: 'Example page' },
        backendDOMNodeId: 11 + backendOffset,
        properties: [{ name: 'level', value: { value: 1 } }],
        childIds: []
      },
      {
        nodeId: 'button',
        role: { value: 'button' },
        name: { value: 'Continue' },
        backendDOMNodeId: 12 + backendOffset,
        childIds: []
      },
      ...(duplicateButtons
        ? [
            {
              nodeId: 'button-2',
              role: { value: 'button' },
              name: { value: 'Continue' },
              backendDOMNodeId: 13 + backendOffset,
              childIds: []
            }
          ]
        : []),
      {
        nodeId: 'input',
        role: { value: 'textbox' },
        name: { value: '' },
        backendDOMNodeId: 13 + Number(duplicateButtons) + backendOffset,
        childIds: []
      },
      {
        nodeId: 'link',
        role: { value: 'link' },
        name: { value: 'Next' },
        backendDOMNodeId: 14 + Number(duplicateButtons) + backendOffset,
        childIds: []
      }
    ]
  }
}

function createHarness(options: { staleBackendOnce?: boolean; duplicateButtons?: boolean } = {}) {
  let backendOffset = 0
  let staleBackendOnce = options.staleBackendOnce === true
  const duplicateButtons = options.duplicateButtons === true
  const executeCommand = vi.fn(async (_tabId: string, method: string, params?: unknown) => {
    if (method === 'Accessibility.getFullAXTree') return axTree(backendOffset, duplicateButtons)
    if (method === 'Runtime.evaluate') {
      const expression =
        typeof params === 'object' && params !== null && 'expression' in params
          ? (params as { expression?: unknown }).expression
          : undefined
      if (typeof expression === 'string' && expression.includes('querySelectorAll')) {
        return { result: { value: [] } }
      }
      if (typeof expression === 'string' && expression.includes('location.href')) {
        return { result: { value: rawSnapshot() } }
      }
      return { result: { value: { ok: true, x: 40, y: 40 } } }
    }
    if (method === 'DOM.describeNode') {
      const backendNodeId =
        typeof params === 'object' && params !== null && 'backendNodeId' in params
          ? (params as { backendNodeId?: number }).backendNodeId
          : undefined
      const localName =
        backendNodeId === 13 + Number(duplicateButtons) + backendOffset
          ? 'input'
          : backendNodeId === 12 + backendOffset
            ? 'button'
            : backendNodeId === 14 + Number(duplicateButtons) + backendOffset
              ? 'a'
              : 'h1'
      return {
        node: {
          localName,
          nodeName: localName.toUpperCase(),
          backendNodeId,
          attributes:
            localName === 'input'
              ? ['type', 'text', 'placeholder', 'Search']
              : localName === 'a'
                ? ['href', '/next']
                : []
        }
      }
    }
    if (method === 'DOM.resolveNode') {
      if (staleBackendOnce) {
        staleBackendOnce = false
        backendOffset = 100
        throw new Error('Could not find node with given id')
      }
      return { object: { objectId: 'object-1' } }
    }
    if (method === 'DOM.getBoxModel') {
      return { model: { content: [10, 10, 50, 10, 50, 50, 10, 50] } }
    }
    if (method === 'Runtime.callFunctionOn') {
      const functionDeclaration =
        typeof params === 'object' && params !== null && 'functionDeclaration' in params
          ? (params as { functionDeclaration?: unknown }).functionDeclaration
          : undefined
      if (
        typeof functionDeclaration === 'string' &&
        functionDeclaration.includes('return this.href')
      ) {
        return { result: { value: 'https://example.com/next' } }
      }
      return { result: { value: { ok: true } } }
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
  const snapshots = new Map<
    string,
    { snapshot: ReturnType<typeof normalizeBrowserDomSnapshot>; internalTabId: string }
  >()
  const requestPanelOpen = vi.fn()
  const tools = createBrowserAgentTools({
    sessionId: 'session-1',
    getTabManager: () => tabs,
    getControlService: () => ({ executeCommand }),
    requestPanelOpen,
    snapshots,
    tabHandles: {
      getOrCreate: (tabId) => (tabId === tab.id ? 't1' : 't2'),
      resolve: (handle) => (handle === 't1' ? tab.id : undefined),
      remove: vi.fn(),
      clear: vi.fn()
    }
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
  it('creates compact short refs and hides hrefs unless explicitly requested', () => {
    const snapshot = normalizeBrowserDomSnapshot(rawSnapshot(), 't1', 3)
    expect(snapshot.snapshotId).toBe('s3')
    expect(snapshot.elements[0]?.elementId).toBe('e1')
    expect(snapshot.elements[1]?.elementId).toBe('e2')
    expect(snapshot.elements[1]?.parentElementId).toBe('e1')
    expect(snapshot.elements[2]?.input).toBe(true)
    expect(snapshot.elements[0]?.href).toBeUndefined()

    const withUrls = normalizeBrowserDomSnapshot(rawSnapshot(), 't1', 4, 120, {
      includeUrls: true,
      interactiveOnly: false,
      compact: false
    })
    expect(withUrls.elements[0]?.href).toBe('https://example.com/hidden-from-default')
  })

  it('uses public tab handles and an accessibility tree for inspection', async () => {
    const { executeCommand, requestPanelOpen, tools } = createHarness()
    const open = await executeTool(tool(tools, 'browser_open'), { url: 'example.com' })
    expect((open.details as { tab: { tabId: string } }).tab.tabId).toBe('t1')
    expect(JSON.stringify(open.details)).not.toContain('tab-1')
    expect(requestPanelOpen).toHaveBeenCalledWith('session-1')

    const inspected = await executeTool(tool(tools, 'browser_inspect'), { tabId: 't1' })
    const details = inspected.details as { elements: BrowserSnapshotElement[]; tabId: string }
    const heading = details.elements.find((element) => element.role === 'heading')
    const button = details.elements.find((element) => element.role === 'button')
    expect(details.tabId).toBe('t1')
    expect(button?.elementId).toBe('e2')
    expect(inspected.content[0]?.text).toContain('@e2 [button]')
    expect(inspected.content[0]?.text).not.toContain('tab-1')
    expect(executeCommand).toHaveBeenCalledWith('tab-1', 'Accessibility.getFullAXTree', {})

    const withUrls = await executeTool(tool(tools, 'browser_inspect'), {
      tabId: 't1',
      includeUrls: true
    })
    const link = (withUrls.details as { elements: BrowserSnapshotElement[] }).elements.find(
      (element) => element.role === 'link'
    )
    expect(link?.href).toBe('https://example.com/next')

    await expect(
      executeTool(tool(tools, 'browser_click'), { tabId: 't1', ref: `@${heading?.elementId}` })
    ).rejects.toThrow('not clickable')

    await executeTool(tool(tools, 'browser_click'), { tabId: 't1', ref: `@${button?.elementId}` })
    expect(executeCommand).toHaveBeenCalledWith(
      'tab-1',
      'Input.dispatchMouseEvent',
      expect.anything()
    )
  })

  it('accepts bare refs, falls back after a stale backend node, and invalidates refs after actions', async () => {
    const { tools, snapshots } = createHarness({ staleBackendOnce: true })
    await executeTool(tool(tools, 'browser_inspect'), { tabId: 't1' })
    await executeTool(tool(tools, 'browser_click'), { tabId: 't1', ref: 'e2' })
    expect(snapshots.has('session-1:tab-1')).toBe(false)
    await expect(
      executeTool(tool(tools, 'browser_click'), { tabId: 't1', ref: '@e2' })
    ).rejects.toThrow('stale')
  })

  it('uses role/name nth when duplicate refs need a fresh backend node', async () => {
    const { tools, snapshots } = createHarness({ staleBackendOnce: true, duplicateButtons: true })
    const inspected = await executeTool(tool(tools, 'browser_inspect'), { tabId: 't1' })
    const buttons = (inspected.details as { elements: BrowserSnapshotElement[] }).elements.filter(
      (element) => element.role === 'button'
    )
    const internalButtons = snapshots
      .get('session-1:tab-1')!
      .snapshot.elements.filter((element) => element.role === 'button')
    expect(internalButtons.map((button) => button.duplicateIndex)).toEqual([0, 1])
    await executeTool(tool(tools, 'browser_click'), {
      tabId: 't1',
      ref: `@${buttons[1]?.elementId}`
    })
  })

  it('types without echoing the value and returns screenshots as image content', async () => {
    const { tools } = createHarness()
    await executeTool(tool(tools, 'browser_inspect'), { tabId: 't1' })
    const typed = await executeTool(tool(tools, 'browser_type'), {
      tabId: 't1',
      ref: '@e3',
      text: 'private-value'
    })
    expect(typed.content[0]?.text).not.toContain('private-value')

    const screenshot = await executeTool(tool(tools, 'browser_screenshot'), { tabId: 't1' })
    expect(screenshot.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' })
      ])
    )
  })
})

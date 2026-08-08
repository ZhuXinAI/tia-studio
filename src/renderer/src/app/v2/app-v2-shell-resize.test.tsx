// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppV2ShellBottomDrawer } from './app-v2-shell-bottom-drawer'
import { AppV2ShellRightRail } from './app-v2-shell-right-rail'
import {
  BOTTOM_DRAWER_DEFAULT_HEIGHT,
  BOTTOM_DRAWER_MAX_HEIGHT,
  BOTTOM_DRAWER_MIN_HEIGHT,
  RIGHT_RAIL_DEFAULT_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH
} from './app-v2-shell-resize'

function createPointerEvent(
  type: string,
  {
    clientX = 0,
    clientY = 0,
    button = 0
  }: { clientX?: number; clientY?: number; button?: number } = {}
): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperties(event, {
    button: { value: button },
    clientX: { value: clientX },
    clientY: { value: clientY }
  })
  return event
}

function ControlledRightRail(): React.JSX.Element {
  const [width, setWidth] = useState(RIGHT_RAIL_DEFAULT_WIDTH)
  return (
    <AppV2ShellRightRail
      onSlotElementChange={() => undefined}
      width={width}
      onWidthChange={setWidth}
    />
  )
}

function ControlledBottomDrawer(): React.JSX.Element {
  const [height, setHeight] = useState(BOTTOM_DRAWER_DEFAULT_HEIGHT)
  return (
    <AppV2ShellBottomDrawer
      onSlotElementChange={() => undefined}
      height={height}
      onHeightChange={setHeight}
    />
  )
}

describe('App V2 drawer resizing', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('resizes the right rail from its edge and supports keyboard bounds', async () => {
    await act(async () => root.render(<ControlledRightRail />))

    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    expect(separator?.getAttribute('aria-valuenow')).toBe(String(RIGHT_RAIL_DEFAULT_WIDTH))

    await act(async () => {
      separator?.dispatchEvent(createPointerEvent('pointerdown', { clientX: 500 }))
    })
    expect(document.body.style.cursor).toBe('col-resize')

    await act(async () => {
      window.dispatchEvent(createPointerEvent('pointermove', { clientX: 400 }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe('420')

    await act(async () => {
      window.dispatchEvent(createPointerEvent('pointerup', { clientX: 400 }))
    })
    expect(document.body.style.cursor).toBe('')

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe(String(RIGHT_RAIL_MIN_WIDTH))

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe(String(RIGHT_RAIL_MAX_WIDTH))
  })

  it('resizes the bottom drawer upward from its edge and supports arrow keys', async () => {
    await act(async () => root.render(<ControlledBottomDrawer />))

    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    expect(separator?.getAttribute('aria-valuenow')).toBe(String(BOTTOM_DRAWER_DEFAULT_HEIGHT))

    await act(async () => {
      separator?.dispatchEvent(createPointerEvent('pointerdown', { clientY: 500 }))
    })
    expect(document.body.style.cursor).toBe('row-resize')

    await act(async () => {
      window.dispatchEvent(createPointerEvent('pointermove', { clientY: 350 }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe('510')

    await act(async () => {
      window.dispatchEvent(createPointerEvent('pointerup', { clientY: 350 }))
    })
    expect(document.body.style.cursor).toBe('')

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe('486')

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe(String(BOTTOM_DRAWER_MIN_HEIGHT))

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(separator?.getAttribute('aria-valuenow')).toBe(String(BOTTOM_DRAWER_MAX_HEIGHT))
  })
})

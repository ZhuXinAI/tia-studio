// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThreadQueuePanel } from './thread-queue-panel'

describe('ThreadQueuePanel', () => {
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
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('shows steering and follow-up messages above the composer', () => {
    act(() => {
      root.render(
        <ThreadQueuePanel
          queue={{
            steering: ['Use the direct MCP URL'],
            followUps: ['Verify the connection']
          }}
        />
      )
    })

    expect(container.textContent).toContain('Use the direct MCP URL')
    expect(container.textContent).toContain('Verify the connection')
    expect(container.textContent).toContain('Steer current run')
    expect(container.textContent).toContain('Queue follow-up')
  })
})

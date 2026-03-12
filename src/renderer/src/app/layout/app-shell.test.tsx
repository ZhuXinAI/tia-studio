import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './app-shell'

describe('AppShell', () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    if (typeof originalWindow !== 'undefined') {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true
      })
      return
    }

    Reflect.deleteProperty(globalThis, 'window')
  })

  it('uses Electron platform info for the header padding and keeps drag regions intact', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        electron: {
          process: {
            platform: 'win32',
            versions: {},
            env: {}
          }
        } as Window['electron']
      },
      configurable: true,
      writable: true
    })

    const router = createMemoryRouter([
      {
        path: '/',
        element: <AppShell />
      }
    ])
    const html = renderToString(<RouterProvider router={router} />)

    expect(html).toContain('flex-1 p-0')
    expect(html).not.toContain('p-4 md:p-6')
    expect(html).toContain('drag-region')
    expect(html).toContain('no-drag')
    expect(html).not.toContain('pl-[80px]')
  })
})

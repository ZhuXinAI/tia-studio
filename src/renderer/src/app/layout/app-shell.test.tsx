import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './app-shell'

vi.mock('../../lib/desktop-bootstrap', () => ({
  isDesktopWindowsPlatform: () => true,
  getDesktopBootstrapSnapshot: () => ({
    apiBaseUrl: 'http://127.0.0.1:4769',
    authMode: 'bearer',
    authToken: 'test-token',
    app: {
      name: 'TIA Studio',
      version: '0.3.2',
      platform: 'win32'
    },
    capabilities: {
      autoUpdate: true,
      managedRuntimes: true,
      nativeDirectoryPicker: true,
      runtimeOnboarding: true
    }
  })
}))

function renderWithQueryClient(router: ReturnType<typeof createMemoryRouter>): string {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('AppShell', () => {
  it('uses Electron platform info for the header padding and keeps drag regions intact', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <AppShell />
      }
    ])
    const html = renderWithQueryClient(router)

    expect(html).toContain('flex-1 p-0')
    expect(html).not.toContain('p-4 md:p-6')
    expect(html).toContain('drag-region')
    expect(html).toContain('no-drag')
    expect(html).not.toContain('pl-[80px]')
  })
})

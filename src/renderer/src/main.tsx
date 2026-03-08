import '@xyflow/react/dist/style.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createAppRouter } from './app/router'

import { ThemeProvider } from './components/theme-provider'
import { Toaster } from './components/ui/sonner'
import { ErrorBoundary } from './components/error-boundary'
import { TooltipProvider } from './components/ui/tooltip'
import { queryClient } from './lib/query-client'

const appRouter = createAppRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <RouterProvider router={appRouter} />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)

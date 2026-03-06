import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { createAppRouter } from './app/router'

import { ThemeProvider } from './components/theme-provider'
import { Toaster } from './components/ui/sonner'
import { ErrorBoundary } from './components/error-boundary'
import { TooltipProvider } from './components/ui/tooltip'

const appRouter = createAppRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <RouterProvider router={appRouter} />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)

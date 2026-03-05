import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { createAppRouter } from './app/router'

import { ThemeProvider } from './components/theme-provider'
import { Toaster } from './components/ui/sonner'

const appRouter = createAppRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={appRouter} />
      <Toaster />
    </ThemeProvider>
  </StrictMode>
)

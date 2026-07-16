import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      // Pi is ESM-only. Bundle its SDK into Electron main instead of leaving a
      // CommonJS require() that Electron cannot resolve at runtime.
      externalizeDeps: {
        exclude: ['@earendil-works/pi-coding-agent']
      },
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})

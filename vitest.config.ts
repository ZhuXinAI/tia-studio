import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']]
  }
})

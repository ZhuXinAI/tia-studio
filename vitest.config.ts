import { resolve } from 'path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    exclude: [...configDefaults.exclude, '.worktrees/**'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']]
  }
})

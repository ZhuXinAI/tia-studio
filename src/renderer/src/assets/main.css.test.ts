import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('theme tokens', () => {
  it('uses a neutral dark background by default', () => {
    const css = fs.readFileSync(new URL('./main.css', import.meta.url), 'utf8')
    expect(css).toMatch(/:root\s*\{[\s\S]*--background:\s*#09090b\s*;[\s\S]*\}/)
  })

  it('defines light theme overrides for key tokens', () => {
    const css = fs.readFileSync(new URL('./main.css', import.meta.url), 'utf8')
    expect(css).toMatch(
      /\.light\s*\{[\s\S]*--background:\s*(?!#09090b)[^;]+;[\s\S]*--foreground:\s*[^;]+;[\s\S]*--card:\s*[^;]+;[\s\S]*--border:\s*[^;]+;[\s\S]*\}/
    )
  })
})

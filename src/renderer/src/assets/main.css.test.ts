import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('theme tokens', () => {
  it('uses neutral-800 as the background', () => {
    const css = fs.readFileSync(new URL('./main.css', import.meta.url), 'utf8')
    expect(css).toMatch(/:root\s*\{[\s\S]*--background:\s*#262626\s*;[\s\S]*\}/)
  })
})

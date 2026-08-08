import { describe, expect, it } from 'vitest'
import { normalizeBrowserUrl } from './browser'

describe('browser URL policy', () => {
  it('accepts HTTP, HTTPS, and the blank tab URL', () => {
    expect(normalizeBrowserUrl(' https://example.com/path ')).toBe('https://example.com/path')
    expect(normalizeBrowserUrl('http://localhost:3000/')).toBe('http://localhost:3000/')
    expect(normalizeBrowserUrl('about:blank')).toBe('about:blank')
  })

  it('rejects script, file, data, and malformed URLs', () => {
    expect(normalizeBrowserUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeBrowserUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeBrowserUrl('data:text/html,hello')).toBeNull()
    expect(normalizeBrowserUrl('example.com')).toBeNull()
    expect(normalizeBrowserUrl('')).toBeNull()
  })
})

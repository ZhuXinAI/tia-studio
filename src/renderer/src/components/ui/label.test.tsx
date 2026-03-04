import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Label } from './label'

describe('Label', () => {
  it('includes adjacent disabled-control selectors for input-like fields', () => {
    const html = renderToString(<Label htmlFor="example">Example</Label>)

    expect(html).toContain('has-[+input:disabled]:cursor-not-allowed')
    expect(html).toContain('has-[+input:disabled]:opacity-50')
    expect(html).toContain('has-[+textarea:disabled]:cursor-not-allowed')
    expect(html).toContain('has-[+textarea:disabled]:opacity-50')
    expect(html).toContain('has-[+select:disabled]:cursor-not-allowed')
    expect(html).toContain('has-[+select:disabled]:opacity-50')
  })
})

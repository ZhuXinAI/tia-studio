import { describe, expect, it } from 'vitest'
import { describeRequestError } from './request-errors'

describe('describeRequestError', () => {
  it('keeps long provider details useful but bounded', () => {
    const detail = `Provider rejected the request: ${'invalid parameter '.repeat(80)}`

    const message = describeRequestError({ error: detail }, 'Fallback')

    expect(message).toHaveLength(480)
    expect(message).toMatch(/…$/)
    expect(message).toContain('Provider rejected the request')
  })
})

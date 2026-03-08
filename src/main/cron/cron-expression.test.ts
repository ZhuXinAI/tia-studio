import { describe, expect, it } from 'vitest'
import { getNextCronRunAt, isValidCronExpression } from './cron-expression'

describe('cron expression helpers', () => {
  it('validates supported five-field cron expressions', () => {
    expect(isValidCronExpression('*/15 9-17 * * 1-5')).toBe(true)
    expect(isValidCronExpression('0 0 1 * *')).toBe(true)

    expect(isValidCronExpression('* * *')).toBe(false)
    expect(isValidCronExpression('* * * * * *')).toBe(false)
    expect(isValidCronExpression('61 * * * *')).toBe(false)
    expect(isValidCronExpression('0 24 * * *')).toBe(false)
  })

  it('computes the next future run from a timestamp', () => {
    expect(
      getNextCronRunAt('30 10 * * *', new Date('2026-03-09T10:15:45.000Z'))?.toISOString()
    ).toBe('2026-03-09T10:30:00.000Z')

    expect(
      getNextCronRunAt('30 10 * * *', new Date('2026-03-09T10:30:00.000Z'))?.toISOString()
    ).toBe('2026-03-10T10:30:00.000Z')
  })
})

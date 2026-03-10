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

  it('computes the next future run from a timestamp using local time', () => {
    // from = local 10:15, cron = "30 10 * * *" → next = local 10:30 same day
    const from1 = new Date(2026, 2, 9, 10, 15, 45)
    const result1 = getNextCronRunAt('30 10 * * *', from1)!
    expect(result1.getFullYear()).toBe(2026)
    expect(result1.getMonth()).toBe(2)
    expect(result1.getDate()).toBe(9)
    expect(result1.getHours()).toBe(10)
    expect(result1.getMinutes()).toBe(30)

    // from = local 10:30, cron = "30 10 * * *" → next = local 10:30 next day
    const from2 = new Date(2026, 2, 9, 10, 30, 0)
    const result2 = getNextCronRunAt('30 10 * * *', from2)!
    expect(result2.getFullYear()).toBe(2026)
    expect(result2.getMonth()).toBe(2)
    expect(result2.getDate()).toBe(10)
    expect(result2.getHours()).toBe(10)
    expect(result2.getMinutes()).toBe(30)
  })
})

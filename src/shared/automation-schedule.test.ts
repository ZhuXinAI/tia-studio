import { describe, expect, it } from 'vitest'
import { describeAutomationSchedule } from './automation-schedule'

describe('automation schedule helpers', () => {
  it('formats weekly RRULEs and resolves the next run', () => {
    const details = describeAutomationSchedule(
      'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=MO,WE,FR',
      new Date('2026-06-30T01:00:00.000Z')
    )

    expect(details.summary).toBe('Every Monday, Wednesday, Friday at 09:00')
    expect(details.nextRunAt).toBe(new Date(2026, 6, 1, 9, 0, 0, 0).toISOString())
    expect(details.normalizedRule).toBe('FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=MO,WE,FR')
  })

  it('falls back cleanly when the RRULE is unsupported', () => {
    const details = describeAutomationSchedule(
      'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
      new Date('2026-06-30T01:00:00.000Z')
    )

    expect(details.summary).toBe('RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1')
    expect(details.nextRunAt).toBeNull()
  })
})
